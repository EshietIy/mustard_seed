package ng.mustardseed.app.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ng.mustardseed.app.api.models.ContactDto
import ng.mustardseed.app.api.models.DeliveryAddressDto
import ng.mustardseed.app.api.models.OrderItemInputDto
import ng.mustardseed.app.api.models.PlaceOrderDto
import ng.mustardseed.app.api.models.QuoteDto
import ng.mustardseed.app.api.models.QuoteRequestDto
import ng.mustardseed.app.cart.CartStore
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.OrdersRepository
import ng.mustardseed.app.data.Outcome
import java.util.UUID

const val BRANCH_ID = "calabar"

/** Which input a validation message belongs to (same keys as the API's field errors). */
enum class Field(
    val apiField: String,
) {
    NAME("contact.fullName"),
    PHONE("contact.phone"),
    ADDRESS("delivery.streetAddress"),
}

/** A message for a field: our own check (by kind) or the server's words. */
sealed interface FieldError {
    data object Missing : FieldError

    data class Server(
        val message: String,
    ) : FieldError
}

data class CheckoutUiState(
    val delivery: Boolean = true,
    val fullName: String = "",
    val phone: String = "",
    val streetAddress: String = "",
    val quote: QuoteDto? = null,
    val quoteLoading: Boolean = false,
    val quoteError: AppError? = null,
    val fieldErrors: Map<Field, FieldError> = emptyMap(),
    val submitting: Boolean = false,
    val submitError: AppError? = null,
    /** e.g. "Prices have changed since you started checkout." (from the server). */
    val notice: String? = null,
)

/**
 * Checkout (same rules as the website): the server computes every total; the order is placed with
 * the total the customer saw, and one id per attempt means a retried submit never creates a second
 * order. The cart is kept until payment is verified.
 */
class CheckoutViewModel(
    private val cart: CartStore,
    private val orders: OrdersRepository,
    prefillName: String,
) : ViewModel() {
    private val _state = MutableStateFlow(CheckoutUiState(fullName = prefillName))
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    private val _placed = Channel<String>(Channel.BUFFERED)

    /** The new order's id, once placed. */
    val placed = _placed.receiveAsFlow()

    private val clientRequestId = UUID.randomUUID()

    init {
        viewModelScope.launch {
            cart.refresh()
            loadQuote()
        }
    }

    fun setDelivery(delivery: Boolean) {
        _state.update { it.copy(delivery = delivery, fieldErrors = it.fieldErrors - Field.ADDRESS) }
        viewModelScope.launch { loadQuote() }
    }

    fun setName(value: String) = _state.update { it.copy(fullName = value, fieldErrors = it.fieldErrors - Field.NAME) }

    fun setPhone(value: String) = _state.update { it.copy(phone = value, fieldErrors = it.fieldErrors - Field.PHONE) }

    fun setAddress(value: String) =
        _state.update {
            it.copy(
                streetAddress = value,
                fieldErrors =
                    it.fieldErrors - Field.ADDRESS,
            )
        }

    fun retryQuote() {
        viewModelScope.launch { loadQuote() }
    }

    private fun items() =
        cart.state.value.lines.map { line ->
            OrderItemInputDto(
                UUID.fromString(line.itemId),
                line.quantity.toLong(),
                line.options.map { UUID.fromString(it.id) }.ifEmpty { null },
            )
        }

    private suspend fun loadQuote() {
        if (cart.state.value.isEmpty) return
        _state.update { it.copy(quoteLoading = true, quoteError = null) }
        val fulfilment =
            if (_state.value.delivery) QuoteRequestDto.Fulfilment.DELIVERY else QuoteRequestDto.Fulfilment.PICKUP
        when (val outcome = orders.quote(QuoteRequestDto(fulfilment, BRANCH_ID, items()))) {
            is Outcome.Success -> _state.update { it.copy(quote = outcome.value, quoteLoading = false) }
            is Outcome.Failure -> _state.update { it.copy(quoteError = outcome.error, quoteLoading = false) }
        }
    }

    fun submit() {
        val s = _state.value
        val missing =
            buildMap {
                if (s.fullName.trim().length < 2) put(Field.NAME, FieldError.Missing)
                if (s.phone.isBlank()) put(Field.PHONE, FieldError.Missing)
                if (s.delivery && s.streetAddress.trim().length < 5) put(Field.ADDRESS, FieldError.Missing)
            }
        if (missing.isNotEmpty()) {
            _state.update { it.copy(fieldErrors = missing) }
            return
        }
        val total = s.quote?.totalKobo ?: return
        if (s.quote.canPlaceOrder.not() || cart.state.value.hasProblems || s.submitting) return
        _state.update { it.copy(submitting = true, submitError = null, notice = null) }
        viewModelScope.launch {
            val order =
                PlaceOrderDto(
                    fulfilment = if (s.delivery) PlaceOrderDto.Fulfilment.DELIVERY else PlaceOrderDto.Fulfilment.PICKUP,
                    branchId = BRANCH_ID,
                    items = items(),
                    contact = ContactDto(s.fullName.trim(), s.phone.trim()),
                    expectedTotalKobo = total,
                    clientRequestId = clientRequestId,
                    delivery = if (s.delivery) DeliveryAddressDto(s.streetAddress.trim(), "Calabar") else null,
                )
            when (val outcome = orders.place(order)) {
                is Outcome.Success -> {
                    _state.update { it.copy(submitting = false) }
                    _placed.send(outcome.value.id.toString())
                }

                is Outcome.Failure -> {
                    handleFailure(outcome.error)
                }
            }
        }
    }

    private suspend fun handleFailure(error: AppError) {
        val rejected = error as? AppError.Rejected
        when {
            rejected?.code == "PRICE_CHANGED" -> {
                // Prices moved under us: show the new total and let the customer confirm again.
                _state.update { it.copy(submitting = false, notice = rejected.message) }
                loadQuote()
            }

            rejected != null && rejected.fieldErrors.isNotEmpty() -> {
                val mapped =
                    Field.entries
                        .mapNotNull { field ->
                            rejected.fieldErrors[field.apiField]?.firstOrNull()?.let {
                                field to
                                    FieldError.Server(it)
                            }
                        }.toMap()
                _state.update {
                    it.copy(
                        submitting = false,
                        fieldErrors = mapped,
                        submitError = if (mapped.isEmpty()) error else null,
                    )
                }
            }

            else -> {
                _state.update { it.copy(submitting = false, submitError = error) }
            }
        }
    }
}
