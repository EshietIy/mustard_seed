package ng.mustardseed.app.ui.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ng.mustardseed.app.cart.CartStore
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.MenuRepository
import ng.mustardseed.app.data.OrderView
import ng.mustardseed.app.data.OrdersRepository
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.data.toView

enum class OrderMode { VIEW, CONFIRMING, CONFIRM_ERROR, STILL_PENDING }

data class OrderUiState(
    val order: OrderView? = null,
    val loadError: AppError? = null,
    val mode: OrderMode = OrderMode.VIEW,
    val confirmError: AppError? = null,
    val paying: Boolean = false,
    val payError: AppError? = null,
    val notice: String? = null,
)

sealed interface OrderEvent {
    data class OpenPaymentPage(
        val url: String,
    ) : OrderEvent

    data object GoToCheckout : OrderEvent

    data object SomeLeftOut : OrderEvent
}

const val CONFIRM_POLL_MS = 3_000L
const val CONFIRM_MAX_POLLS = 20

/**
 * The order page (same as the website): never assumes a payment's outcome from coming back to
 * the app; it asks the server, and polls while the payment is pending.
 */
class OrderViewModel(
    private val orderId: String,
    reference: String?,
    private val orders: OrdersRepository,
    private val cart: CartStore,
    private val menu: MenuRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(OrderUiState())
    val state: StateFlow<OrderUiState> = _state.asStateFlow()

    private val _events = Channel<OrderEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    /** The payment started from this screen, to confirm when the customer comes back. */
    private var pendingReference: String? = reference
    private var confirmJob: Job? = null

    init {
        if (reference != null) confirm(reference) else load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loadError = null) }
            when (val outcome = orders.get(orderId)) {
                is Outcome.Success -> show(outcome.value.toView())
                is Outcome.Failure -> _state.update { it.copy(loadError = outcome.error) }
            }
        }
    }

    /** Back from the payment page (by App Link or by closing the tab): ask the server. */
    fun onReturn() {
        val reference = pendingReference ?: return
        if (_state.value.order?.status == "awaiting_payment" && _state.value.mode == OrderMode.VIEW) confirm(reference)
    }

    fun checkAgain() {
        pendingReference?.let(::confirm)
    }

    private fun confirm(reference: String) {
        confirmJob?.cancel()
        confirmJob =
            viewModelScope.launch {
                _state.update { it.copy(mode = OrderMode.CONFIRMING, confirmError = null) }
                repeat(CONFIRM_MAX_POLLS) {
                    when (val outcome = orders.verifyPayment(reference)) {
                        is Outcome.Failure -> {
                            _state.update { it.copy(mode = OrderMode.CONFIRM_ERROR, confirmError = outcome.error) }
                            return@launch
                        }

                        is Outcome.Success -> {
                            val order = outcome.value.toView()
                            if (order.status != "awaiting_payment") {
                                pendingReference = null
                                show(order)
                                _state.update { it.copy(mode = OrderMode.VIEW) }
                                return@launch
                            }
                            _state.update { it.copy(order = order) }
                        }
                    }
                    delay(CONFIRM_POLL_MS)
                }
                _state.update { it.copy(mode = OrderMode.STILL_PENDING) }
            }
    }

    fun payNow() {
        val order = _state.value.order ?: return
        _state.update { it.copy(paying = true, payError = null, notice = null) }
        viewModelScope.launch {
            when (val outcome = orders.startPayment(order.id ?: orderId)) {
                is Outcome.Success -> {
                    pendingReference = outcome.value.reference
                    _state.update { it.copy(paying = false) }
                    _events.send(OrderEvent.OpenPaymentPage(outcome.value.authorizationUrl))
                }

                is Outcome.Failure -> {
                    val conflict = (outcome.error as? AppError.Rejected)?.takeIf { it.status == 409 }
                    if (conflict != null) {
                        // e.g. the order expired: say so and show its new state.
                        _state.update { it.copy(paying = false, notice = conflict.message) }
                        load()
                    } else {
                        _state.update { it.copy(paying = false, payError = outcome.error) }
                    }
                }
            }
        }
    }

    /** Puts the order's items back in the cart (never doubling them) and goes to checkout. */
    fun orderAgain() {
        val order = _state.value.order ?: return
        viewModelScope.launch {
            val items =
                (menu.menu() as? Outcome.Success)
                    ?.value
                    ?.categories
                    ?.flatMap { it.items }
                    .orEmpty()
                    .associateBy { it.id }
            var skipped = 0
            for (line in order.lines) {
                val item = items[line.menuItemId]
                val offered =
                    item
                        ?.optionGroups
                        ?.flatMap { g ->
                            g.options.filter { it.isAvailable }.map { it.id }
                        }.orEmpty()
                if (item == null || !item.isAvailable || !line.optionIds.all { it in offered } ||
                    !cart.ensure(item, line.optionIds, line.quantity)
                ) {
                    skipped += 1
                }
            }
            if (skipped > 0) _events.send(OrderEvent.SomeLeftOut)
            _events.send(OrderEvent.GoToCheckout)
        }
    }

    private suspend fun show(order: OrderView) {
        _state.update { it.copy(order = order) }
        // A verified payment takes the ordered items out of the saved cart.
        if (order.status == "paid") cart.refresh()
    }
}
