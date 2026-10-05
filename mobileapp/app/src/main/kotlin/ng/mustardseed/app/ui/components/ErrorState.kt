package ng.mustardseed.app.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.ui.theme.Brand

/** The friendly message for each failure (same wording as the website). */
@StringRes
fun AppError.messageRes(): Int =
    when (this) {
        AppError.Offline -> {
            R.string.error_offline
        }

        AppError.Unreachable -> {
            R.string.error_network
        }

        AppError.Timeout -> {
            R.string.error_timeout
        }

        AppError.NotFound -> {
            R.string.error_not_found
        }

        AppError.UpdateRequired -> {
            R.string.error_update_required
        }

        AppError.SignInRequired -> {
            R.string.error_sign_in
        }

        AppError.Forbidden -> {
            R.string.error_forbidden
        }

        is AppError.Rejected -> {
            when (status) {
                409 -> R.string.error_conflict
                else -> R.string.error_validation
            }
        }

        is AppError.RateLimited -> {
            R.string.error_rate_limited
        }

        is AppError.Server -> {
            R.string.error_server
        }

        is AppError.Unknown -> {
            R.string.error_unknown
        }
    }

private val AppError.reference: String?
    get() =
        when (this) {
            is AppError.Server -> requestId
            is AppError.Unknown -> requestId
            else -> null
        }

/** The words to show: the server's own message when it gave one, else the friendly default. */
@Composable
fun errorMessage(error: AppError): String = (error as? AppError.Rejected)?.message ?: stringResource(error.messageRes())

/** Error card in the design tokens: crimson edge, clear text, never colour alone. */
@Composable
fun ErrorState(
    title: String,
    error: AppError,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(16.dp))
            .background(Brand.White)
            .border(1.dp, Brand.Border, RoundedCornerShape(16.dp))
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Spacer(Modifier.width(4.dp).fillMaxHeight().background(Brand.Crimson))
        Column(Modifier.padding(20.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = Brand.Charcoal)
            Spacer(Modifier.height(4.dp))
            Text(
                errorMessage(error),
                style = MaterialTheme.typography.bodyMedium,
                color = Brand.TextMuted,
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson, contentColor = Brand.White),
            ) {
                Text(stringResource(R.string.try_again))
            }
            error.reference?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(R.string.reference, it),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
            }
        }
    }
}
