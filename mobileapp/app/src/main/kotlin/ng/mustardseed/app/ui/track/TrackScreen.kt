package ng.mustardseed.app.ui.track

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.FINAL_STATUSES
import ng.mustardseed.app.ui.components.Card
import ng.mustardseed.app.ui.components.ErrorState
import ng.mustardseed.app.ui.components.Notice
import ng.mustardseed.app.ui.components.OrderProgress
import ng.mustardseed.app.ui.components.StatusPill
import ng.mustardseed.app.ui.order.OrderDetails
import ng.mustardseed.app.ui.order.PrimaryButton
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.clockWat

private val IN_PROGRESS = setOf("paid", "preparing", "ready", "out_for_delivery")

@Composable
fun TrackScreen(
    state: TrackUiState,
    onRetry: () -> Unit,
    onHome: () -> Unit,
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
            state.loadError is AppError.NotFound -> {
                Card {
                    Text(stringResource(R.string.track_not_found_title), style = MaterialTheme.typography.headlineSmall)
                    Text(
                        stringResource(R.string.track_not_found_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.TextMuted,
                    )
                    PrimaryButton(stringResource(R.string.back_to_menu), onClick = onHome)
                }
            }

            state.loadError != null -> {
                ErrorState(stringResource(R.string.order_unavailable), state.loadError, onRetry)
            }

            order == null -> {
                Text(
                    stringResource(R.string.order_loading),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.TextMuted,
                )
            }

            else -> {
                Text(
                    stringResource(R.string.track_order).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Brand.Crimson,
                )
                Text(
                    stringResource(R.string.order_title, order.orderNumber),
                    style = MaterialTheme.typography.displaySmall,
                )
                StatusPill(order.status)
                if (state.refreshFailed) {
                    Text(
                        stringResource(R.string.track_refresh_failed),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.TextMuted,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                val active = order.status in IN_PROGRESS
                if (active || order.status == "delivered" || order.status == "collected") {
                    Card {
                        OrderProgress(order.status, order.isDelivery)
                        if (active) {
                            order.estimatedReadyAt?.let {
                                Text(
                                    stringResource(
                                        if (order.isDelivery) R.string.eta_delivery else R.string.eta_pickup,
                                        clockWat(it),
                                    ),
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                            Text(
                                stringResource(R.string.track_updates),
                                style = MaterialTheme.typography.bodySmall,
                                color = Brand.TextMuted,
                            )
                        }
                    }
                }
                when (order.status) {
                    "cancelled" -> Notice(stringResource(R.string.track_cancelled))
                    "payment_failed", "expired" -> Notice(stringResource(R.string.track_not_paid))
                    "awaiting_payment" -> Notice(stringResource(R.string.track_waiting))
                }
                if (order.status in FINAL_STATUSES || active || order.status == "awaiting_payment") OrderDetails(order)
            }
        }
    }
}
