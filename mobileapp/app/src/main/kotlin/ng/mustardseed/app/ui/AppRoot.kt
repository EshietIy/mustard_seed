package ng.mustardseed.app.ui

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ng.mustardseed.app.AppContainer
import ng.mustardseed.app.R
import ng.mustardseed.app.api.models.PublicConfigDto
import ng.mustardseed.app.api.models.SiteInfoDto
import ng.mustardseed.app.auth.GoogleSignInLauncher
import ng.mustardseed.app.auth.GoogleSignInResult
import ng.mustardseed.app.auth.SessionState
import ng.mustardseed.app.cart.CartMessage
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.ui.cart.CartActions
import ng.mustardseed.app.ui.cart.CartScreen
import ng.mustardseed.app.ui.checkout.CheckoutActions
import ng.mustardseed.app.ui.checkout.CheckoutScreen
import ng.mustardseed.app.ui.checkout.CheckoutViewModel
import ng.mustardseed.app.ui.components.TestModeBanner
import ng.mustardseed.app.ui.components.errorMessage
import ng.mustardseed.app.ui.menu.ChoiceSheet
import ng.mustardseed.app.ui.menu.HomeExtras
import ng.mustardseed.app.ui.menu.MenuScreen
import ng.mustardseed.app.ui.menu.MenuViewModel
import ng.mustardseed.app.ui.order.OrderActions
import ng.mustardseed.app.ui.order.OrderEvent
import ng.mustardseed.app.ui.order.OrderScreen
import ng.mustardseed.app.ui.order.OrderViewModel
import ng.mustardseed.app.ui.track.TrackScreen
import ng.mustardseed.app.ui.track.TrackViewModel

data class AppUiState(
    val site: SiteInfoDto? = null,
    val googleClientId: String? = null,
    val testMode: Boolean = false,
)

/** Site facts and public config, shared by every screen. Failures leave placeholders. */
class AppViewModel(
    private val container: AppContainer,
) : ViewModel() {
    private val _state = MutableStateFlow(AppUiState())
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            (container.site.site() as? Outcome.Success)?.let { s -> _state.update { it.copy(site = s.value) } }
            (container.site.config() as? Outcome.Success)?.let { c ->
                _state.update {
                    it.copy(
                        googleClientId = c.value.googleClientId,
                        testMode =
                            c.value.paymentMode == PublicConfigDto.PaymentMode.SIMULATED,
                    )
                }
            }
        }
    }
}

object Routes {
    const val HOME = "home"
    const val CART = "cart"
    const val CHECKOUT = "checkout"
    const val ORDER = "orders/{id}?reference={reference}"
    const val TRACK = "track/{token}"

    fun order(id: String) = "orders/$id"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(
    container: AppContainer,
    signInLauncher: GoogleSignInLauncher,
    siteOrigin: String,
    navController: NavHostController = rememberNavController(),
    openUrl: (
        Context,
        String,
    ) -> Unit = { context, url -> CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url)) },
) {
    val app: AppViewModel = viewModel(factory = viewModelFactory { initializer { AppViewModel(container) } })
    val appState by app.state.collectAsStateWithLifecycle()
    val session by container.session.state.collectAsStateWithLifecycle()
    val cartState by container.cart.state.collectAsStateWithLifecycle()
    val signedIn = session as? SessionState.SignedIn
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var choosing by remember { mutableStateOf<MenuItem?>(null) }
    var accountOpen by remember { mutableStateOf(false) }

    val strings =
        object {
            val cancelled = stringResource(R.string.sign_in_cancelled)
            val failed = stringResource(R.string.sign_in_failed)
            val leftOut = stringResource(R.string.some_left_out)
            val unavailable = stringResource(R.string.some_unavailable)
            val limit = stringResource(R.string.limit_reached, "%s")
            val noAccount = stringResource(R.string.sign_in_no_account)
        }

    // Messages from the shared cart (refusals, items left out at sign-in).
    val cartErrorText = remember { mutableStateOf<CartMessage?>(null) }
    LaunchedEffect(Unit) { container.cart.messages.collect { cartErrorText.value = it } }
    cartErrorText.value?.let { message ->
        val text =
            when (message) {
                CartMessage.SomeLeftOut -> strings.leftOut
                is CartMessage.Failed -> errorMessage(message.error)
            }
        LaunchedEffect(message) {
            snackbar.showSnackbar(text)
            cartErrorText.value = null
        }
    }

    fun signIn() {
        scope.launch {
            val clientId =
                appState.googleClientId ?: run {
                    app.load()
                    snackbar.showSnackbar(strings.failed)
                    return@launch
                }
            when (val result = signInLauncher.idToken(clientId)) {
                is GoogleSignInResult.Success -> {
                    if (container.session.signIn(
                            result.idToken,
                        ) is Outcome.Failure
                    ) {
                        snackbar.showSnackbar(strings.failed)
                    }
                }

                GoogleSignInResult.Cancelled -> {
                    snackbar.showSnackbar(strings.cancelled)
                }

                GoogleSignInResult.Failed -> {
                    snackbar.showSnackbar(strings.failed)
                }

                GoogleSignInResult.NoAccount -> {
                    snackbar.showSnackbar(strings.noAccount)
                }
            }
        }
    }

    fun add(
        item: MenuItem,
        optionIds: List<String>,
        added: String,
    ) {
        scope.launch {
            when {
                container.cart.atLimit(item.id, optionIds) -> snackbar.showSnackbar(strings.limit.format(item.name))
                container.cart.add(item, optionIds) -> snackbar.showSnackbar(added)
            }
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (appState.testMode) TestModeBanner()
            NavHost(navController, startDestination = Routes.HOME, modifier = Modifier.fillMaxSize()) {
                composable(Routes.HOME) {
                    val vm: MenuViewModel =
                        viewModel(factory = viewModelFactory { initializer { MenuViewModel(container.menu) } })
                    val state by vm.state.collectAsStateWithLifecycle()
                    val addedTemplate = stringResource(R.string.added, "%s")
                    MenuScreen(
                        state = state.copy(testMode = false),
                        onRetry = vm::retry,
                        onSelectCategory = vm::selectCategory,
                        extras =
                            HomeExtras(
                                site = appState.site,
                                cartCount = cartState.count,
                                account = signedIn?.user,
                                onAdd = { item ->
                                    if (item.optionGroups.isEmpty()) {
                                        add(item, emptyList(), addedTemplate.format(item.name))
                                    } else {
                                        choosing =
                                            item
                                    }
                                },
                                onOpenCart = { navController.navigate(Routes.CART) },
                                onAccount = { if (signedIn == null) signIn() else accountOpen = true },
                            ),
                    )
                    choosing?.let { item ->
                        ModalBottomSheet(onDismissRequest = { choosing = null }) {
                            ChoiceSheet(item, onAdd = { ids ->
                                choosing = null
                                val names =
                                    item.optionGroups
                                        .flatMap { it.options }
                                        .filter { it.id in ids }
                                        .joinToString { it.name }
                                add(
                                    item,
                                    ids,
                                    addedTemplate.format(if (names.isEmpty()) item.name else "${item.name} ($names)"),
                                )
                            })
                        }
                    }
                }
                composable(Routes.CART) {
                    CartScreen(
                        cart = cartState,
                        site = appState.site,
                        actions =
                            CartActions(
                                onIncrement = { scope.launch { container.cart.increment(it) } },
                                onDecrement = { scope.launch { container.cart.decrement(it) } },
                                onAcceptPrice = { scope.launch { container.cart.acceptPrice(it) } },
                                onCheckout = { navController.navigate(Routes.CHECKOUT) },
                            ),
                    )
                }
                composable(Routes.CHECKOUT) {
                    if (signedIn == null) {
                        CheckoutScreen(
                            state =
                                ng.mustardseed.app.ui.checkout
                                    .CheckoutUiState(),
                            cart = cartState,
                            signedIn = false,
                            actions = CheckoutActions(onSignIn = ::signIn),
                        )
                    } else {
                        val vm: CheckoutViewModel =
                            viewModel(
                                factory =
                                    viewModelFactory {
                                        initializer {
                                            CheckoutViewModel(
                                                container.cart,
                                                container.orders,
                                                signedIn.user.fullName,
                                            )
                                        }
                                    },
                            )
                        val state by vm.state.collectAsStateWithLifecycle()
                        LaunchedEffect(vm) {
                            vm.placed.collect { id ->
                                navController.navigate(Routes.order(id)) { popUpTo(Routes.HOME) }
                            }
                        }
                        CheckoutScreen(
                            state = state,
                            cart = cartState,
                            signedIn = true,
                            actions =
                                CheckoutActions(
                                    onDelivery = vm::setDelivery,
                                    onName = vm::setName,
                                    onPhone = vm::setPhone,
                                    onAddress = vm::setAddress,
                                    onSubmit = vm::submit,
                                    onRetryQuote = vm::retryQuote,
                                ),
                        )
                    }
                }
                composable(
                    Routes.ORDER,
                    arguments =
                        listOf(
                            navArgument("id") { type = NavType.StringType },
                            navArgument("reference") {
                                type = NavType.StringType
                                nullable = true
                            },
                        ),
                    // The payment page returns here: https://<site>/orders/<id>?reference=… (App Link).
                    deepLinks = listOf(navDeepLink { uriPattern = "$siteOrigin/orders/{id}?reference={reference}" }),
                ) { entry ->
                    val id = entry.arguments?.getString("id").orEmpty()
                    val reference = entry.arguments?.getString("reference")
                    val vm: OrderViewModel =
                        viewModel(
                            key = "order-$id-$reference",
                            factory =
                                viewModelFactory {
                                    initializer {
                                        OrderViewModel(
                                            id,
                                            reference,
                                            container.orders,
                                            container.cart,
                                            container.menu,
                                        )
                                    }
                                },
                        )
                    val state by vm.state.collectAsStateWithLifecycle()
                    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.onReturn() }
                    LaunchedEffect(vm) {
                        vm.events.collect { event ->
                            when (event) {
                                is OrderEvent.OpenPaymentPage -> openUrl(context, event.url)
                                OrderEvent.GoToCheckout -> navController.navigate(Routes.CHECKOUT)
                                OrderEvent.SomeLeftOut -> snackbar.showSnackbar(strings.unavailable)
                            }
                        }
                    }
                    if (signedIn == null) {
                        CheckoutScreen(
                            state =
                                ng.mustardseed.app.ui.checkout
                                    .CheckoutUiState(),
                            cart = cartState,
                            signedIn = false,
                            actions = CheckoutActions(onSignIn = ::signIn),
                        )
                    } else {
                        OrderScreen(
                            state = state,
                            firstName = signedIn.user.firstName,
                            email = signedIn.user.email,
                            actions =
                                OrderActions(
                                    onPayNow = vm::payNow,
                                    onCheckAgain = vm::checkAgain,
                                    onRetry = vm::load,
                                    onOrderAgain = vm::orderAgain,
                                ),
                        )
                    }
                }
                composable(
                    Routes.TRACK,
                    // The confirmation email's "Track your order live" link (App Link).
                    deepLinks = listOf(navDeepLink { uriPattern = "$siteOrigin/track/{token}" }),
                ) { entry ->
                    val token = entry.arguments?.getString("token").orEmpty()
                    val vm: TrackViewModel =
                        viewModel(
                            key = "track-$token",
                            factory = viewModelFactory { initializer { TrackViewModel(token, container.orders) } },
                        )
                    val state by vm.state.collectAsStateWithLifecycle()
                    TrackScreen(state, onRetry = vm::load, onHome = { navController.navigate(Routes.HOME) })
                }
            }
        }
    }

    if (accountOpen && signedIn != null) {
        AlertDialog(
            onDismissRequest = { accountOpen = false },
            title = { Text(signedIn.user.fullName) },
            text = { Text(signedIn.user.email) },
            confirmButton = {
                TextButton(onClick = {
                    accountOpen = false
                    scope.launch { container.session.signOut() }
                }) { Text(stringResource(R.string.sign_out)) }
            },
            dismissButton = { TextButton(onClick = { accountOpen = false }) { Text(stringResource(R.string.close)) } },
        )
    }
}
