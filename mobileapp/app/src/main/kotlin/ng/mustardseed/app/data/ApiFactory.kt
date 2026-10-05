package ng.mustardseed.app.data

import ng.mustardseed.app.api.apis.ConfigApi
import ng.mustardseed.app.api.apis.MenuApi
import ng.mustardseed.app.api.infrastructure.Serializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/** Builds the generated API clients with the app's headers and timeouts. */
class ApiFactory(
    origin: String,
    appVersion: String,
    timeoutMs: Long = 15_000,
) {
    private val client =
        OkHttpClient
            .Builder()
            .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .addInterceptor { chain ->
                chain.proceed(
                    chain
                        .request()
                        .newBuilder()
                        .header("X-App-Version", appVersion)
                        .header("Accept", "application/json")
                        .build(),
                )
            }.build()

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

    /** Shared with the image loader so photos use the same connection pool. */
    val httpClient: OkHttpClient get() = client
}
