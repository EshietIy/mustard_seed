package ng.mustardseed.app.ui.order

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.data.OrderView
import ng.mustardseed.app.ui.components.Card
import ng.mustardseed.app.ui.components.ErrorState
import ng.mustardseed.app.ui.components.Notice
import ng.mustardseed.app.ui.components.OrderProgress
import ng.mustardseed.app.ui.components.OrderSummary
import ng.mustardseed.app.ui.components.StatusPill
import ng.mustardseed.app.ui.components.SummaryLine
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.clockWat
import ng.mustardseed.app.util.formatNaira

data class OrderActions(
    val onPayNow: () -> Unit = {},
    val onCheckAgain: () -> Unit = {},
    val onRetry: () -> Unit = {},
    val onOrderAgain: () -> Unit = {},
)

@Composable
fun OrderScreen(
    state: OrderUiState,
    firstName: String?,
    email: String?,
    actions: OrderActions,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxSize()
            .background(Brand.Cream)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val order = state.order
        when {
            state.mode == OrderMode.CONFIRMING -> {
                Card(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                    CircularProgressIndicator(
                        color = Brand.Crimson,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                    Text(stringResource(R.string.confirming_payment), style = MaterialTheme.typography.headlineSmall)
                    Text(
                        stringResource(R.string.confirming_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.TextMuted,
                    )
                }
            }

            state.mode == OrderMode.CONFIRM_ERROR && state.confirmError != null -> {
                ErrorState(stringResource(R.string.confirm_failed), state.confirmError, actions.onCheckAgain)
            }

            state.mode == OrderMode.STILL_PENDING -> {
                Card(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                    Text(stringResource(R.string.still_pending), style = MaterialTheme.typography.headlineSmall)
                    order?.let {
                        Text(
                            stringResource(R.string.still_pending_body, clockWat(it.paymentExpiresAt)),
                            style = MaterialTheme.typography.bodySmall,
                            color = Brand.TextMuted,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    PrimaryButton(stringResource(R.string.check_again), onClick = actions.onCheckAgain)
                }
            }

            state.loadError != null -> {
                ErrorState(stringResource(R.string.order_unavailable), state.loadError, actions.onRetry)
            }

            order == null -> {
                Text(
                    stringResource(R.string.order_loading),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.TextMuted,
                )
            }

            else -> {
                OrderBody(order, state, firstName, email, actions)
            }
        }
        if (state.mode == OrderMode.CONFIRM_ERROR) {
            Text(
                stringResource(R.string.confirm_failed_body),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextMuted,
            )
        }
    }
}

@Composable
private fun OrderBody(
    order: OrderView,
    state: OrderUiState,
    firstName: String?,
    email: String?,
    actions: OrderActions,
) {
    Text(
        stringResource(R.string.order_received).uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = Brand.Crimson,
    )
    Text(
        stringResource(R.string.order_title, order.orderNumber),
        style = MaterialTheme.typography.displaySmall,
        color = Brand.Charcoal,
    )
    StatusPill(order.status)
    state.notice?.let { Notice(it) }
    when (order.status) {
        "awaiting_payment" -> {
            Card {
                Text(
                    stringResource(R.string.pay_by, clockWat(order.paymentExpiresAt)),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(10.dp))
                PrimaryButton(
                    if (state.paying) {
                        stringResource(
                            R.string.opening_payment,
                        )
                    } else {
                        stringResource(R.string.pay_now, formatNaira(order.totalKobo))
                    },
                    enabled = !state.paying,
                    onClick = actions.onPayNow,
                )
                Text(
                    stringResource(R.string.cooking_starts),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
                email?.let {
                    Text(
                        stringResource(R.string.email_note, it),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.TextMuted,
                    )
                }
                state.payError?.let { ErrorState(stringResource(R.string.payment_page_failed), it, actions.onPayNow) }
            }
        }

        "payment_failed", "expired" -> {
            Card {
                Text(
                    stringResource(
                        if (order.status ==
                            "expired"
                        ) {
                            R.string.expired_line
                        } else {
                            R.string.payment_failed_line
                        },
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(10.dp))
                PrimaryButton(stringResource(R.string.order_again), onClick = actions.onOrderAgain)
            }
        }

        else -> {
            Card {
                if (order.status == "paid") {
                    Text(
                        stringResource(R.string.in_the_kitchen, firstName ?: order.contactName.substringBefore(' ')),
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        stringResource(if (order.isDelivery) R.string.rider_line else R.string.pickup_line),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.TextMuted,
                    )
                }
                OrderProgress(order.status, order.isDelivery)
                order.estimatedReadyAt?.let {
                    Text(
                        stringResource(
                            if (order.isDelivery) R.string.eta_delivery else R.string.eta_pickup,
                            clockWat(it),
                        ),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                if (order.status == "paid") {
                    email?.let {
                        Text(
                            stringResource(R.string.email_shortly, it),
                            style = MaterialTheme.typography.bodySmall,
                            color = Brand.TextMuted,
                        )
                    }
                }
            }
        }
    }
    OrderDetails(order)
}

@Composable
fun OrderDetails(order: OrderView) {
    Card {
        OrderSummary(
            lines = order.lines.map { SummaryLine(it.quantity, it.name, it.options, it.lineTotalKobo) },
            subtotalKobo = order.subtotalKobo,
            deliveryFeeKobo = order.deliveryFeeKobo,
            totalKobo = order.totalKobo,
            delivery = order.isDelivery,
            totalLabel = if (order.paymentStatus == "success") R.string.total_paid else R.string.total,
        )
    }
    Card {
        Text(
            stringResource(if (order.isDelivery) R.string.delivering_to else R.string.picking_up).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Brand.Crimson,
        )
        Text(order.contactName, style = MaterialTheme.typography.labelLarge)
        if (order.streetAddress != null) {
            Text(order.streetAddress, style = MaterialTheme.typography.bodySmall)
            Text(
                stringResource(R.string.delivery_city, order.deliveryCity ?: order.branchCity),
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            Text(stringResource(R.string.pickup_at, order.branchCity), style = MaterialTheme.typography.bodySmall)
        }
        Text(order.contactPhone, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun PrimaryButton(
    text: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson, contentColor = Brand.White),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(text) }
}
