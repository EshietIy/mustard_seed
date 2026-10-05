package ng.mustardseed.app.data

import kotlinx.coroutines.runBlocking
import ng.mustardseed.app.api.apis.AuthApi
import ng.mustardseed.app.api.apis.CartApi
import ng.mustardseed.app.api.apis.ConfigApi
import ng.mustardseed.app.api.apis.MenuApi
import ng.mustardseed.app.api.apis.OrdersApi
import ng.mustardseed.app.api.apis.PaymentsApi
import ng.mustardseed.app.api.apis.SiteApi
import ng.mustardseed.app.api.infrastructure.Serializer
import ng.mustardseed.app.auth.TokenProvider
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Builds the generated API clients with the app's headers and timeouts. With a [session], every
 * request carries the bearer access token, and a 401 triggers one refresh and one retry.
 */
class ApiFactory(
    origin: String,
    appVersion: String,
    timeoutMs: Long = 15_000,
    private val session: TokenProvider? = null,
) {
    private val client =
        OkHttpClient
            .Builder()
            .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .addInterceptor { chain ->
                val request =
                    chain
                        .request()
                        .newBuilder()
                        .header("X-App-Version", appVersion)
                        .header("Accept", "application/json")
                session?.accessToken()?.let { request.header("Authorization", "Bearer $it") }
                chain.proceed(request.build())
            }.apply { if (session != null) authenticator(RefreshingAuthenticator(session)) }
            .build()

    private val retrofit =
        Retrofit
            .Builder()
            .baseUrl(origin)
            .client(client)
            .addConverterFactory(
                Serializer.kotlinxSerializationJson.asConverterFactory("application/json".toMediaType()),
            ).build()

    val menu: MenuApi = retrofit.create(MenuApi::class.java)
    val config: ConfigApi = retrofit.create(ConfigApi::class.java)
    val site: SiteApi = retrofit.create(SiteApi::class.java)
    val auth: AuthApi = retrofit.create(AuthApi::class.java)
    val cart: CartApi = retrofit.create(CartApi::class.java)
    val orders: OrdersApi = retrofit.create(OrdersApi::class.java)
    val payments: PaymentsApi = retrofit.create(PaymentsApi::class.java)

    /** Shared with the image loader so photos use the same connection pool. */
    val httpClient: OkHttpClient get() = client
}

/** On a 401 for a request that carried our access token: refresh once, then retry once. */
private class RefreshingAuthenticator(
    private val session: TokenProvider,
) : Authenticator {
    override fun authenticate(
        route: Route?,
        response: Response,
    ): Request? {
        val failed = response.request.header("Authorization")?.removePrefix("Bearer ") ?: return null
        if (response.priorResponse != null) return null
        if (response.request.url.encodedPath
                .contains("/auth/app/")
        ) {
            return null
        }
        val fresh = runBlocking { session.refreshAfter(failed) } ?: return null
        return response.request
            .newBuilder()
            .header("Authorization", "Bearer $fresh")
            .build()
    }
}
