package ng.mustardseed.app.util

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/** The placeholder shown until a real price is supplied (AGENT.md section 1). */
const val PRICE_PLACEHOLDER = "[PRICE]"

private val symbols = DecimalFormatSymbols(Locale.US)

/** Kobo (integer) to naira for display only, e.g. 450000 → "₦4,500". Money is never a float. */
fun formatNaira(kobo: Long): String {
    val naira = kobo / 100
    val rest = kobo % 100
    val whole = DecimalFormat("#,##0", symbols).format(naira)
    return if (rest == 0L) "₦$whole" else "₦$whole.${rest.toString().padStart(2, '0')}"
}

fun priceLabel(kobo: Long?): String = kobo?.let(::formatNaira) ?: PRICE_PLACEHOLDER
