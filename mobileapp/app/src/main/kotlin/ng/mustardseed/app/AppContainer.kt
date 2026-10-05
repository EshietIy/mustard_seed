package ng.mustardseed.app

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import ng.mustardseed.app.auth.KeystoreTokenStore
import ng.mustardseed.app.auth.SessionManager
import ng.mustardseed.app.cart.CartStore
import ng.mustardseed.app.cart.PrefsGuestCartStorage
import ng.mustardseed.app.data.ApiCartRepository
import ng.mustardseed.app.data.ApiFactory
import ng.mustardseed.app.data.ApiMenuRepository
import ng.mustardseed.app.data.ApiOrdersRepository
import ng.mustardseed.app.data.ApiSiteRepository
import ng.mustardseed.app.data.CartRepository
import ng.mustardseed.app.data.MenuRepository
import ng.mustardseed.app.data.OrdersRepository
import ng.mustardseed.app.data.SiteRepository

/** Everything shared across screens, created once per app launch. */
class AppContainer(
    val session: SessionManager,
    val menu: MenuRepository,
    val site: SiteRepository,
    val orders: OrdersRepository,
    val cartRepository: CartRepository,
    val cart: CartStore,
    val imageClient: okhttp3.OkHttpClient?,
) {
    companion object {
        fun create(context: Context): AppContainer {
            val isOnline = { isOnline(context) }
            val plain = ApiFactory(BuildConfig.API_ORIGIN, BuildConfig.APP_VERSION)
            val session = SessionManager(plain.auth, KeystoreTokenStore(context), isOnline)
            val api = ApiFactory(BuildConfig.API_ORIGIN, BuildConfig.APP_VERSION, session = session)
            val cartRepository = ApiCartRepository(api, isOnline)
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            return AppContainer(
                session = session,
                menu = ApiMenuRepository(api, isOnline),
                site = ApiSiteRepository(api, isOnline),
                orders = ApiOrdersRepository(api, isOnline),
                cartRepository = cartRepository,
                cart = CartStore(session.state, cartRepository, PrefsGuestCartStorage(context), scope),
                imageClient = api.httpClient,
            )
        }

        private fun isOnline(context: Context): Boolean {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
            return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
    }
}

class MustardSeedApp : Application() {
    val container: AppContainer by lazy { AppContainer.create(this) }
}
