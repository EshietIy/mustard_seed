package ng.mustardseed.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import ng.mustardseed.app.data.ApiFactory
import ng.mustardseed.app.data.ApiMenuRepository
import ng.mustardseed.app.ui.menu.MenuScreen
import ng.mustardseed.app.ui.menu.MenuViewModel
import ng.mustardseed.app.ui.theme.MustardSeedTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val api = ApiFactory(origin = BuildConfig.API_ORIGIN, appVersion = BuildConfig.APP_VERSION)
        val repository = ApiMenuRepository(api, isOnline = ::isOnline)
        setContent {
            setSingletonImageLoaderFactory { context ->
                ImageLoader
                    .Builder(context)
                    .components { add(OkHttpNetworkFetcherFactory(callFactory = { api.httpClient })) }
                    .build()
            }
            MustardSeedTheme {
                val vm: MenuViewModel =
                    viewModel(factory = viewModelFactory { initializer { MenuViewModel(repository) } })
                val state by vm.state.collectAsStateWithLifecycle()
                MenuScreen(
                    state = state,
                    onRetry = vm::retry,
                    onSelectCategory = vm::selectCategory,
                    modifier = Modifier.fillMaxSize().safeDrawingPadding(),
                )
            }
        }
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
