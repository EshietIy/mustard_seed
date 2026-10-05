package ng.mustardseed.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.DisposableEffect
import androidx.core.util.Consumer
import androidx.navigation.compose.rememberNavController
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import ng.mustardseed.app.auth.CredentialManagerSignIn
import ng.mustardseed.app.ui.AppRoot
import ng.mustardseed.app.ui.theme.MustardSeedTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as MustardSeedApp).container
        val signIn = CredentialManagerSignIn(this)
        setContent {
            setSingletonImageLoaderFactory { context ->
                ImageLoader
                    .Builder(context)
                    .apply {
                        container.imageClient?.let { client ->
                            components { add(OkHttpNetworkFetcherFactory(callFactory = { client })) }
                        }
                    }.build()
            }
            val nav = rememberNavController()
            // A payment return or email link while the app is already open (singleTask).
            DisposableEffect(nav) {
                val listener = Consumer<android.content.Intent> { nav.handleDeepLink(it) }
                addOnNewIntentListener(listener)
                onDispose { removeOnNewIntentListener(listener) }
            }
            MustardSeedTheme {
                AppRoot(container, signIn, BuildConfig.SITE_ORIGIN, nav)
            }
        }
    }
}
