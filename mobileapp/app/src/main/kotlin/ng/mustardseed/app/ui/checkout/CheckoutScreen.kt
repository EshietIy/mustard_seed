package ng.mustardseed.app.ui.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.cart.CartState
import ng.mustardseed.app.ui.components.Card
import ng.mustardseed.app.ui.components.ErrorState
import ng.mustardseed.app.ui.components.Notice
import ng.mustardseed.app.ui.components.OrderSummary
import ng.mustardseed.app.ui.components.SummaryLine
import ng.mustardseed.app.ui.theme.Brand

data class CheckoutActions(
    val onDelivery: (Boolean) -> Unit = {},
    val onName: (String) -> Unit = {},
    val onPhone: (String) -> Unit = {},
    val onAddress: (String) -> Unit = {},
    val onSubmit: () -> Unit = {},
    val onRetryQuote: () -> Unit = {},
    val onSignIn: () -> Unit = {},
)

@Composable
fun CheckoutScreen(
    state: CheckoutUiState,
    cart: CartState,
    signedIn: Boolean,
    actions: CheckoutActions,
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
        Text(
            stringResource(R.string.checkout_title),
            style = MaterialTheme.typography.displaySmall,
            color = Brand.Charcoal,
        )
        if (!signedIn) {
            Card {
                Text(stringResource(R.string.checkout_sign_in_title), style = MaterialTheme.typography.titleLarge)
                Text(
                    stringResource(R.string.checkout_sign_in_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = actions.onSignIn,
                    colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson),
                ) {
                    Text(stringResource(R.string.sign_in))
                }
            }
            return@Column
        }
        if (cart.isEmpty) {
            Text(stringResource(R.string.cart_empty_title), style = MaterialTheme.typography.titleLarge)
            return@Column
        }
        state.notice?.let { Notice(it) }
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Choice(stringResource(R.string.fulfilment_delivery), state.delivery) { actions.onDelivery(true) }
                Choice(stringResource(R.string.fulfilment_pickup), !state.delivery) { actions.onDelivery(false) }
            }
            Spacer(Modifier.height(8.dp))
            Input(
                stringResource(R.string.field_name),
                state.fullName,
                state.fieldErrors[Field.NAME],
                R.string.error_name,
                actions.onName,
            )
            Input(
                stringResource(R.string.field_phone),
                state.phone,
                state.fieldErrors[Field.PHONE],
                R.string.error_phone,
                actions.onPhone,
                KeyboardType.Phone,
            )
            if (state.delivery) {
                Input(
                    stringResource(R.string.field_address),
                    state.streetAddress,
                    state.fieldErrors[Field.ADDRESS],
                    R.string.error_address,
                    actions.onAddress,
                )
                Text(
                    stringResource(R.string.delivery_city, "Calabar"),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
            } else {
                Text(
                    stringResource(R.string.pickup_at, "Calabar"),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
            }
        }
        val quote = state.quote
        when {
            state.quoteError != null -> {
                ErrorState(stringResource(R.string.quote_unavailable), state.quoteError, actions.onRetryQuote)
            }

            quote == null -> {
                Text(
                    stringResource(R.string.quote_loading),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.TextMuted,
                )
            }

            else -> {
                Card {
                    OrderSummary(
                        lines =
                            quote.lines.map {
                                SummaryLine(
                                    it.quantity.toInt(),
                                    it.name,
                                    it.options.map { o ->
                                        o.name
                                    },
                                    it.lineTotalKobo,
                                )
                            },
                        subtotalKobo = quote.subtotalKobo,
                        deliveryFeeKobo = quote.deliveryFeeKobo,
                        totalKobo = quote.totalKobo,
                        delivery = state.delivery,
                    )
                    quote.problems.forEach { Notice(it.message) }
                }
            }
        }
        state.submitError?.let { ErrorState(stringResource(R.string.order_failed), it, actions.onSubmit) }
        Button(
            onClick = actions.onSubmit,
            enabled = quote?.canPlaceOrder == true && !cart.hasProblems && !state.submitting && !state.quoteLoading,
            colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson, contentColor = Brand.White),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(if (state.submitting) R.string.placing_order else R.string.place_order)) }
    }
}

@Composable
private fun Choice(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.selectable(selected, role = Role.RadioButton, onClick = onClick).padding(end = 16.dp),
    ) {
        RadioButton(selected, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = Brand.Crimson))
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Input(
    label: String,
    value: String,
    error: FieldError?,
    missingMessage: Int,
    onChange: (String) -> Unit,
    keyboard: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        isError = error != null,
        supportingText =
            error?.let {
                {
                    Text(
                        when (it) {
                            FieldError.Missing -> stringResource(missingMessage)
                            is FieldError.Server -> it.message
                        },
                    )
                }
            },
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}
