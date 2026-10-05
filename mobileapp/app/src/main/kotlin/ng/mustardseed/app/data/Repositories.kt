package ng.mustardseed.app.data

import ng.mustardseed.app.api.models.CartDto
import ng.mustardseed.app.api.models.CartLineInputDto
import ng.mustardseed.app.api.models.MergeCartDto
import ng.mustardseed.app.api.models.MergedCartDto
import ng.mustardseed.app.api.models.OrderDto
import ng.mustardseed.app.api.models.PaymentStartedDto
import ng.mustardseed.app.api.models.PlaceOrderDto
import ng.mustardseed.app.api.models.PublicConfigDto
import ng.mustardseed.app.api.models.QuoteDto
import ng.mustardseed.app.api.models.QuoteRequestDto
import ng.mustardseed.app.api.models.SiteInfoDto
import ng.mustardseed.app.api.models.TrackedOrderDto
import ng.mustardseed.app.api.models.VerifyPaymentDto
import java.util.UUID

/** Restaurant facts (hours, delivery fee, branches, phone) and public config. */
interface SiteRepository {
    suspend fun site(): Outcome<SiteInfoDto>

    suspend fun config(): Outcome<PublicConfigDto>
}

/** The signed-in customer's saved cart (AGENT.md section 13). */
interface CartRepository {
    suspend fun get(): Outcome<CartDto>

    suspend fun setLine(
        menuItemId: String,
        optionIds: List<String>,
        quantity: Int,
    ): Outcome<CartDto>

    suspend fun deleteLine(lineId: String): Outcome<CartDto>

    suspend fun clear(): Outcome<CartDto>

    suspend fun merge(lines: List<CartLineInputDto>): Outcome<MergedCartDto>
}

interface OrdersRepository {
    suspend fun quote(request: QuoteRequestDto): Outcome<QuoteDto>

    suspend fun place(order: PlaceOrderDto): Outcome<OrderDto>

    suspend fun get(id: String): Outcome<OrderDto>

    suspend fun track(token: String): Outcome<TrackedOrderDto>

    suspend fun startPayment(orderId: String): Outcome<PaymentStartedDto>

    suspend fun verifyPayment(reference: String): Outcome<OrderDto>
}

class ApiSiteRepository(
    private val api: ApiFactory,
    private val isOnline: () -> Boolean,
) : SiteRepository {
    override suspend fun site() = apiCall(isOnline, { api.site.siteControllerGetV1() }) { it }

    override suspend fun config() = apiCall(isOnline, { api.config.configPublicControllerGetV1() }) { it }
}

class ApiCartRepository(
    private val api: ApiFactory,
    private val isOnline: () -> Boolean,
) : CartRepository {
    override suspend fun get() = apiCall(isOnline, { api.cart.cartControllerGetV1() }) { it }

    override suspend fun setLine(
        menuItemId: String,
        optionIds: List<String>,
        quantity: Int,
    ) = apiCall(isOnline, {
        api.cart.cartControllerSetLineV1(
            CartLineInputDto(UUID.fromString(menuItemId), quantity.toLong(), optionIds.map(UUID::fromString)),
        )
    }) { it }

    override suspend fun deleteLine(lineId: String) =
        apiCall(isOnline, {
            api.cart.cartControllerDeleteLineV1(lineId)
        }) { it }

    override suspend fun clear() = apiCall(isOnline, { api.cart.cartControllerClearV1() }) { it }

    override suspend fun merge(lines: List<CartLineInputDto>) =
        apiCall(isOnline, { api.cart.cartControllerMergeV1(MergeCartDto(lines)) }) { it }
}

class ApiOrdersRepository(
    private val api: ApiFactory,
    private val isOnline: () -> Boolean,
) : OrdersRepository {
    override suspend fun quote(request: QuoteRequestDto) =
        apiCall(isOnline, { api.orders.ordersControllerQuoteV1(request) }) { it }

    override suspend fun place(order: PlaceOrderDto) =
        apiCall(isOnline, {
            api.orders.ordersControllerPlaceV1(order)
        }) { it }

    override suspend fun get(id: String) = apiCall(isOnline, { api.orders.ordersControllerGetV1(id) }) { it }

    override suspend fun track(token: String) = apiCall(isOnline, { api.orders.ordersControllerTrackV1(token) }) { it }

    override suspend fun startPayment(orderId: String) =
        apiCall(isOnline, { api.payments.paymentsControllerStartV1(orderId) }) { it }

    override suspend fun verifyPayment(reference: String) =
        apiCall(isOnline, { api.payments.paymentsControllerVerifyV1(VerifyPaymentDto(reference)) }) { it }
}
