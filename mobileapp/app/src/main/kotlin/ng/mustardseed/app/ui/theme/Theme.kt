package ng.mustardseed.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val colors =
    lightColorScheme(
        primary = Brand.Crimson,
        onPrimary = Brand.White,
        secondary = Brand.Gold,
        onSecondary = Brand.Charcoal,
        background = Brand.Cream,
        onBackground = Brand.Charcoal,
        surface = Brand.White,
        onSurface = Brand.Charcoal,
        surfaceVariant = Brand.Cream,
        onSurfaceVariant = Brand.TextMuted,
        outline = Brand.Border,
        error = Brand.Crimson,
        onError = Brand.White,
    )

private val base = Typography()

private val typography =
    Typography(
        displaySmall =
            TextStyle(
                fontFamily = Cormorant,
                fontWeight = FontWeight.SemiBold,
                fontSize = 32.sp,
                lineHeight = 36.sp,
            ),
        headlineSmall =
            TextStyle(
                fontFamily = Cormorant,
                fontWeight = FontWeight.SemiBold,
                fontSize = 24.sp,
                lineHeight = 28.sp,
            ),
        titleLarge =
            TextStyle(
                fontFamily = Cormorant,
                fontWeight = FontWeight.SemiBold,
                fontSize = 21.sp,
                lineHeight = 24.sp,
            ),
        bodyLarge = base.bodyLarge.copy(fontFamily = JakartaSans),
        bodyMedium = base.bodyMedium.copy(fontFamily = JakartaSans, fontSize = 14.sp),
        bodySmall = base.bodySmall.copy(fontFamily = JakartaSans, fontSize = 13.sp),
        labelLarge = base.labelLarge.copy(fontFamily = JakartaSans, fontWeight = FontWeight.Bold),
        labelMedium = base.labelMedium.copy(fontFamily = JakartaSans, fontWeight = FontWeight.SemiBold),
        labelSmall =
            base.labelSmall.copy(
                fontFamily = JakartaSans,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                letterSpacing = 1.5.sp,
            ),
    )

@Composable
fun MustardSeedTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
