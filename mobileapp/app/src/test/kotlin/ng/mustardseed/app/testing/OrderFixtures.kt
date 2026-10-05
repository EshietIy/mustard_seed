package ng.mustardseed.app.testing

import ng.mustardseed.app.api.models.CartDto
import ng.mustardseed.app.api.models.CartLineInputDto
import ng.mustardseed.app.api.models.MergedCartDto
import ng.mustardseed.app.api.models.OrderBranchDto
import ng.mustardseed.app.api.models.OrderContactDto
import ng.mustardseed.app.api.models.OrderDeliveryDto
import ng.mustardseed.app.api.models.OrderDto
import ng.mustardseed.app.api.models.OrderLineDto
import ng.mustardseed.app.api.models.OrderLineOptionDto
import ng.mustardseed.app.api.models.OrderPaymentDto
import ng.mustardseed.app.api.models.OrderingWindowDto
import ng.mustardseed.app.api.models.PaymentStartedDto
import ng.mustardseed.app.api.models.PlaceOrderDto
import ng.mustardseed.app.api.models.QuoteDto
import ng.mustardseed.app.api.models.QuoteLineDto
import ng.mustardseed.app.api.models.QuoteProblemDto
import ng.mustardseed.app.api.models.QuoteRequestDto
import ng.mustardseed.app.api.models.TrackedOrderDto
import ng.mustardseed.app.data.CartRepository
import ng.mustardseed.app.data.OrdersRepository
import ng.mustardseed.app.data.Outcome
import java.time.OffsetDateTime
import java.util.UUID

val ORDER_ID: UUID = UUID.fromString("00000000-0000-4000-8000-0000000000d1")

fun order(
    status: String = "awaiting_payment",
    delivery: Boolean = true,
    options: List<String> = emptyList(),
    menuItemId: String = "afang-soup",
    eta: OffsetDateTime? = null,
    payment: OrderPaymentDto? = null,
) = OrderDto(
    orderNumber = "#MS-0007",
    status = status,
    fulfilment = if (delivery) OrderDto.Fulfilment.DELIVERY else OrderDto.Fulfilment.PICKUP,
    branch = OrderBranchDto("calabar", "Calabar"),
    items =
        listOf(
            OrderLineDto(
                menuItemId,
                "Afang Soup",
                450_000,
                2,
                900_000,
                options.map {
                    OrderLineOptionDto(it, "Soup protein", "Chicken", 50_000)
                },
            ),
        ),
    subtotalKobo = 900_000,
    deliveryFeeKobo = if (delivery) 150_000 else 0,
    totalKobo = if (delivery) 1_050_000 else 900_000,
    currency = "NGN",
    contact = OrderContactDto("Ekaette Bassey", "+2348031234567"),
    delivery = if (delivery) OrderDeliveryDto("12 Marian Road", "Calabar") else null,
    createdAt = OffsetDateTime.parse("2026-10-05T11:00:00Z"),
    paymentExpiresAt = OffsetDateTime.parse("2026-10-05T11:15:00Z"),
    estimatedReadyAt = eta,
    payment = payment,
    id = ORDER_ID,
)

fun OrderDto.tracked() =
    TrackedOrderDto(
        orderNumber,
        status,
        TrackedOrderDto.Fulfilment.valueOf(fulfilment.name),
        branch,
        items,
        subtotalKobo,
        deliveryFeeKobo,
        totalKobo,
        currency,
        contact,
        delivery,
        createdAt,
        paymentExpiresAt,
        estimatedReadyAt,
        payment,
    )

fun quote(
    total: Long? = 1_050_000,
    problems: List<QuoteProblemDto> = emptyList(),
) = QuoteDto(
    lines = listOf(QuoteLineDto("afang-soup", "Afang Soup", 450_000, 2, 900_000, true, emptyList())),
    subtotalKobo = 900_000,
    deliveryFeeKobo = 150_000,
    totalKobo = total,
    ordering = OrderingWindowDto(true, "08:00", "22:30", "Africa/Lagos"),
    problems = problems,
    canPlaceOrder = problems.isEmpty() && total != null,
)

/** Orders API stand-in: answers come from queues the test fills; calls are recorded. */
class FakeOrdersRepository : OrdersRepository {
    val calls = mutableListOf<String>()
    var quoteAnswer: Outcome<QuoteDto> = Outcome.Success(quote())
    var placeAnswers = ArrayDeque<Outcome<OrderDto>>()
    var getAnswers = ArrayDeque<Outcome<OrderDto>>()
    var trackAnswers = ArrayDeque<Outcome<TrackedOrderDto>>()
    var verifyAnswers = ArrayDeque<Outcome<OrderDto>>()
    var startAnswer: Outcome<PaymentStartedDto> =
        Outcome.Success(
            PaymentStartedDto("MS0007-abc", "https://pay.test/checkout/abc"),
        )
    var placed: PlaceOrderDto? = null
    var quoted: QuoteRequestDto? = null

    private fun <T> next(queue: ArrayDeque<T>): T = if (queue.size > 1) queue.removeFirst() else queue.first()

    override suspend fun quote(request: QuoteRequestDto) =
        quoteAnswer.also {
            quoted = request
            calls +=
                "quote ${request.fulfilment.value}"
        }

    override suspend fun place(order: PlaceOrderDto) =
        next(placeAnswers).also {
            placed = order
            calls += "place"
        }

    override suspend fun get(id: String) = next(getAnswers).also { calls += "get $id" }

    override suspend fun track(token: String) = next(trackAnswers).also { calls += "track" }

    override suspend fun startPayment(orderId: String) = startAnswer.also { calls += "pay $orderId" }

    override suspend fun verifyPayment(reference: String) = next(verifyAnswers).also { calls += "verify $reference" }
}

/** A saved-cart stand-in that always answers with an empty cart (for screens that don't care). */
class EmptyCartRepository : CartRepository {
    private val empty = Outcome.Success(CartDto(emptyList(), 0, 0, false))

    override suspend fun get() = empty

    override suspend fun setLine(
        menuItemId: String,
        optionIds: List<String>,
        quantity: Int,
    ) = empty

    override suspend fun deleteLine(lineId: String) = empty

    override suspend fun clear() = empty

    override suspend fun merge(lines: List<CartLineInputDto>) = Outcome.Success(MergedCartDto(empty.value, 0))
}
