package ng.mustardseed.app.ui.theme

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import ng.mustardseed.app.R

private fun weight(w: Int) = FontVariation.Settings(FontVariation.weight(w))

/** Headings: Cormorant Garamond (bundled, OFL). */
val Cormorant =
    FontFamily(
        Font(R.font.cormorant_garamond, FontWeight.Medium, variationSettings = weight(500)),
        Font(R.font.cormorant_garamond, FontWeight.SemiBold, variationSettings = weight(600)),
        Font(R.font.cormorant_garamond, FontWeight.Bold, variationSettings = weight(700)),
        Font(
            R.font.cormorant_garamond_italic,
            FontWeight.SemiBold,
            FontStyle.Italic,
            variationSettings = weight(600),
        ),
    )

/** UI and body text: Plus Jakarta Sans (bundled, OFL). */
val JakartaSans =
    FontFamily(
        Font(R.font.plus_jakarta_sans, FontWeight.Normal, variationSettings = weight(400)),
        Font(R.font.plus_jakarta_sans, FontWeight.Medium, variationSettings = weight(500)),
        Font(R.font.plus_jakarta_sans, FontWeight.SemiBold, variationSettings = weight(600)),
        Font(R.font.plus_jakarta_sans, FontWeight.Bold, variationSettings = weight(700)),
    )
