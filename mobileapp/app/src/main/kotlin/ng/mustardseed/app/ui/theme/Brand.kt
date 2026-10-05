package ng.mustardseed.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver

/**
 * The five design tokens (AGENT.md section 4), defined once. Everything else is derived from
 * them with opacity, never a new hue.
 */
object Brand {
    val Crimson = Color(0xFF9F2D2D)
    val Gold = Color(0xFFC5A059)
    val Charcoal = Color(0xFF1E221E)
    val Cream = Color(0xFFF4F2EE)
    val White = Color(0xFFFFFFFF)

    val TextMuted = Charcoal.copy(alpha = 0.70f)
    val TextOnDarkMuted = Cream.copy(alpha = 0.75f)
    val Border = Charcoal.copy(alpha = 0.12f)
    val CrimsonSoft = Crimson.copy(alpha = 0.08f)

    /** "Photo coming" placeholder: gold 22% over cream, with faint charcoal stripes. */
    val PlaceholderFill = Gold.copy(alpha = 0.22f).compositeOver(Cream)
    val PlaceholderStripe = Charcoal.copy(alpha = 0.06f)
    val PlaceholderPill = White.copy(alpha = 0.85f)
}
