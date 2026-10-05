package ng.mustardseed.app.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.formatNaira
import ng.mustardseed.app.util.priceLabel

val CardShape = RoundedCornerShape(16.dp)

/** A line in a summary: quantity × name, the chosen options underneath, and its amount. */
data class SummaryLine(
    val quantity: Int,
    val name: String,
    val options: List<String>,
    val amountKobo: Long?,
)

@Composable
fun OrderSummary(
    lines: List<SummaryLine>,
    subtotalKobo: Long?,
    deliveryFeeKobo: Long,
    totalKobo: Long?,
    delivery: Boolean,
    @StringRes totalLabel: Int = R.string.total,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        lines.forEach { line ->
            Row {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${line.quantity} × ${line.name}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Brand.Charcoal,
                    )
                    if (line.options.isNotEmpty()) {
                        Text(
                            line.options.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = Brand.TextMuted,
                        )
                    }
                }
                Text(priceLabel(line.amountKobo), style = MaterialTheme.typography.bodyMedium, color = Brand.Charcoal)
            }
        }
        Spacer(Modifier.height(6.dp))
        Row {
            Text(stringResource(R.string.subtotal), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text(priceLabel(subtotalKobo), style = MaterialTheme.typography.bodyMedium)
        }
        Row {
            Text(
                stringResource(if (delivery) R.string.delivery_fee_label else R.string.pickup_free),
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                if (deliveryFeeKobo ==
                    0L
                ) {
                    stringResource(R.string.free)
                } else {
                    formatNaira(deliveryFeeKobo)
                },
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Row {
            Text(
                stringResource(totalLabel),
                Modifier.weight(1f),
                style = MaterialTheme.typography.titleLarge,
                color = Brand.Charcoal,
            )
            Text(priceLabel(totalKobo), style = MaterialTheme.typography.titleLarge, color = Brand.Charcoal)
        }
    }
}

@StringRes
fun statusLabel(status: String): Int? =
    when (status) {
        "awaiting_payment" -> R.string.status_awaiting_payment
        "paid" -> R.string.status_paid
        "preparing" -> R.string.status_preparing
        "ready" -> R.string.status_ready
        "out_for_delivery" -> R.string.status_out_for_delivery
        "delivered" -> R.string.status_delivered
        "collected" -> R.string.status_collected
        "payment_failed" -> R.string.status_payment_failed
        "expired" -> R.string.status_expired
        "cancelled" -> R.string.status_cancelled
        else -> null
    }

@Composable
fun StatusPill(status: String) {
    Text(
        statusLabel(status)?.let { stringResource(it) } ?: status,
        style = MaterialTheme.typography.labelSmall,
        color = Brand.Gold,
        modifier =
            Modifier
                .background(
                    Brand.Charcoal,
                    RoundedCornerShape(50),
                ).padding(horizontal = 12.dp, vertical = 4.dp),
    )
}

private val REACHED =
    mapOf(
        "paid" to 0,
        "preparing" to 1,
        "ready" to 2,
        "out_for_delivery" to 2,
        "delivered" to 3,
        "collected" to 3,
    )

/** The four-step bar from the confirmation email; pickup ends with "Collected". */
@Composable
fun OrderProgress(
    status: String,
    delivery: Boolean,
) {
    val steps =
        listOf(
            stringResource(R.string.step_confirmed),
            stringResource(R.string.status_preparing),
            stringResource(R.string.status_ready),
            stringResource(if (delivery) R.string.status_delivered else R.string.status_collected),
        )
    val reached = REACHED[status] ?: -1
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        steps.forEachIndexed { i, label ->
            Column(
                Modifier
                    .weight(1f)
                    .semantics {
                        contentDescription = label
                        stateDescription =
                            if (i == reached) {
                                "current"
                            } else if (i < reached) {
                                "done"
                            } else {
                                ""
                            }
                    },
            ) {
                Spacer(
                    Modifier.fillMaxWidth().height(4.dp).background(
                        if (i <=
                            reached
                        ) {
                            Brand.Crimson
                        } else {
                            Brand.Border
                        },
                    ),
                )
                Text(
                    label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color =
                        if (i == reached) {
                            Brand.Crimson
                        } else if (i < reached) {
                            Brand.Charcoal
                        } else {
                            Brand.TextMuted
                        },
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
fun Card(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Brand.White, CardShape)
            .border(1.dp, Brand.Border, CardShape)
            .padding(16.dp),
    ) {
        content()
    }
}

@Composable
fun Notice(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = Brand.Charcoal,
        modifier = Modifier.fillMaxWidth().background(Brand.CrimsonSoft).padding(12.dp),
    )
}
