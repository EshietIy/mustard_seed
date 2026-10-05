package ng.mustardseed.app.ui.cart

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.api.models.SiteInfoDto
import ng.mustardseed.app.cart.CartLine
import ng.mustardseed.app.cart.CartState
import ng.mustardseed.app.cart.MAX_QUANTITY
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.PRICE_PLACEHOLDER
import ng.mustardseed.app.util.formatNaira

private val Shape = RoundedCornerShape(16.dp)

/** Callbacks from the cart; all keyed by the line key. */
data class CartActions(
    val onIncrement: (String) -> Unit = {},
    val onDecrement: (String) -> Unit = {},
    val onAcceptPrice: (String) -> Unit = {},
    val onCheckout: () -> Unit = {},
)

private fun label(line: CartLine) =
    if (line.options.isEmpty()) line.name else "${line.name} (${line.options.joinToString { it.name }})"

@Composable
fun CartScreen(
    cart: CartState,
    site: SiteInfoDto?,
    actions: CartActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().background(Brand.Cream).padding(16.dp)) {
        Text(stringResource(R.string.your_order), style = MaterialTheme.typography.displaySmall, color = Brand.Charcoal)
        Spacer(Modifier.height(12.dp))
        if (cart.isEmpty) {
            Text(
                stringResource(R.string.cart_empty_title),
                style = MaterialTheme.typography.titleLarge,
                color = Brand.Charcoal,
            )
            Text(
                stringResource(R.string.cart_empty_body),
                style = MaterialTheme.typography.bodyMedium,
                color = Brand.TextMuted,
            )
            return@Column
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(cart.lines, key = { it.key }) { line -> LineRow(line, actions) }
        }
        Spacer(Modifier.height(12.dp))
        val warning =
            when {
                cart.lines.any { !it.isAvailable } -> R.string.cart_sold_out_warning
                cart.lines.any { it.priceChange != null } -> R.string.cart_price_warning
                cart.hasProblems -> R.string.cart_problem_warning
                else -> null
            }
        warning?.let {
            Text(
                stringResource(it),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.Charcoal,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(Brand.CrimsonSoft)
                        .padding(10.dp)
                        .semantics { liveRegion = LiveRegionMode.Polite },
            )
            Spacer(Modifier.height(8.dp))
        }
        Row {
            Text(
                stringResource(R.string.subtotal),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Text(
                cart.subtotalKobo?.let(::formatNaira) ?: PRICE_PLACEHOLDER,
                style = MaterialTheme.typography.labelLarge,
                color = Brand.Charcoal,
            )
        }
        site?.let {
            Text(
                stringResource(R.string.delivery_note, formatNaira(it.delivery.feeKobo), it.delivery.area),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextMuted,
            )
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = actions.onCheckout,
            enabled = !cart.hasProblems,
            colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson, contentColor = Brand.White),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.checkout)) }
    }
}

@Composable
private fun LineRow(
    line: CartLine,
    actions: CartActions,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier =
            Modifier
                .fillMaxWidth()
                .background(
                    Brand.White,
                    Shape,
                ).border(1.dp, Brand.Border, Shape)
                .padding(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(line.name, style = MaterialTheme.typography.labelLarge, color = Brand.Charcoal)
            if (line.options.isNotEmpty()) {
                Text(
                    line.options.joinToString(" · ") { it.name },
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
            }
            when {
                !line.isAvailable -> {
                    Text(
                        stringResource(R.string.sold_out),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.Crimson,
                    )
                }

                line.problems.isNotEmpty() -> {
                    Text(line.problems.first(), style = MaterialTheme.typography.bodySmall, color = Brand.Crimson)
                }

                else -> {
                    Text(
                        line.unitPriceKobo?.let { formatNaira(it * line.quantity) } ?: PRICE_PLACEHOLDER,
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.Charcoal,
                    )
                }
            }
            line.priceChange?.let { change ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(
                            R.string.price_changed,
                            formatNaira(change.fromKobo),
                            formatNaira(change.toKobo),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.Crimson,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    val accept = stringResource(R.string.accept_price_named, label(line))
                    Text(
                        stringResource(R.string.accept_price),
                        style = MaterialTheme.typography.labelLarge,
                        color = Brand.Crimson,
                        modifier =
                            Modifier
                                .clickable(role = Role.Button) { actions.onAcceptPrice(line.key) }
                                .semantics { contentDescription = accept }
                                .padding(8.dp),
                    )
                }
            }
        }
        Stepper("−", stringResource(R.string.remove_one, label(line)), enabled = true) { actions.onDecrement(line.key) }
        Text(
            line.quantity.toString(),
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
        Stepper(
            "+",
            stringResource(R.string.add_one, label(line)),
            enabled = line.isAvailable && line.quantity < MAX_QUANTITY,
        ) { actions.onIncrement(line.key) }
    }
}

@Composable
private fun Stepper(
    symbol: String,
    description: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Text(
        symbol,
        style = MaterialTheme.typography.titleLarge,
        textAlign = TextAlign.Center,
        color = if (enabled) Brand.Charcoal else Brand.TextMuted,
        modifier =
            Modifier
                .size(36.dp)
                .clip(CircleShape)
                .border(1.dp, Brand.Border, CircleShape)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .semantics { contentDescription = description },
    )
}
