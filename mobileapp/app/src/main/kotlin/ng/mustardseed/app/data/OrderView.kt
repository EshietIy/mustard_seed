package ng.mustardseed.app.data

import ng.mustardseed.app.api.models.OrderDto
import ng.mustardseed.app.api.models.TrackedOrderDto
import java.time.OffsetDateTime

/** One order as the screens show it, from either the owner's view or the tracking link. */
data class OrderView(
    val id: String?,
    val orderNumber: String,
    val status: String,
    val isDelivery: Boolean,
    val branchCity: String,
    val lines: List<OrderLineView>,
    val subtotalKobo: Long,
    val deliveryFeeKobo: Long,
    val totalKobo: Long,
    val contactName: String,
    val contactPhone: String,
    val streetAddress: String?,
    val deliveryCity: String?,
    val paymentExpiresAt: OffsetDateTime,
    val estimatedReadyAt: OffsetDateTime?,
    val paymentStatus: String?,
)

data class OrderLineView(
    val menuItemId: String,
    val name: String,
    val quantity: Int,
    val lineTotalKobo: Long,
    /** The chosen options, as saved with the order (a snapshot). */
    val optionIds: List<String>,
    val options: List<String>,
)

/** Statuses that never change again: live screens stop refreshing. */
val FINAL_STATUSES = setOf("delivered", "collected", "payment_failed", "expired", "cancelled")

fun OrderDto.toView() =
    OrderView(
        id = id.toString(),
        orderNumber = orderNumber,
        status = status,
        isDelivery = fulfilment == OrderDto.Fulfilment.DELIVERY,
        branchCity = branch.city,
        lines =
            items.map {
                OrderLineView(
                    it.menuItemId,
                    it.name,
                    it.quantity.toInt(),
                    it.lineTotalKobo,
                    it.options.map { o ->
                        o.optionId
                    },
                    it.options.map { o -> o.name },
                )
            },
        subtotalKobo = subtotalKobo,
        deliveryFeeKobo = deliveryFeeKobo,
        totalKobo = totalKobo,
        contactName = contact.fullName,
        contactPhone = contact.phone,
        streetAddress = delivery?.streetAddress,
        deliveryCity = delivery?.city,
        paymentExpiresAt = paymentExpiresAt,
        estimatedReadyAt = estimatedReadyAt,
        paymentStatus = payment?.status,
    )

fun TrackedOrderDto.toView() =
    OrderView(
        id = null,
        orderNumber = orderNumber,
        status = status,
        isDelivery = fulfilment == TrackedOrderDto.Fulfilment.DELIVERY,
        branchCity = branch.city,
        lines =
            items.map {
                OrderLineView(
                    it.menuItemId,
                    it.name,
                    it.quantity.toInt(),
                    it.lineTotalKobo,
                    it.options.map { o ->
                        o.optionId
                    },
                    it.options.map { o -> o.name },
                )
            },
        subtotalKobo = subtotalKobo,
        deliveryFeeKobo = deliveryFeeKobo,
        totalKobo = totalKobo,
        contactName = contact.fullName,
        contactPhone = contact.phone,
        streetAddress = delivery?.streetAddress,
        deliveryCity = delivery?.city,
        paymentExpiresAt = paymentExpiresAt,
        estimatedReadyAt = estimatedReadyAt,
        paymentStatus = payment?.status,
    )
