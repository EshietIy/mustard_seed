package ng.mustardseed.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.ui.theme.Brand

/** The persistent banner shown while payments are simulated (AGENT.md section 3.1). */
@Composable
fun TestModeBanner() {
    Column(Modifier.fillMaxWidth().background(Brand.Charcoal)) {
        Text(
            text = stringResource(R.string.test_mode_banner),
            style = MaterialTheme.typography.labelMedium,
            color = Brand.Gold,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
        )
        Spacer(Modifier.fillMaxWidth().height(2.dp).background(Brand.Crimson))
    }
}

/** The crimson-and-gold zigzag trim from the design. */
@Composable
fun ZigzagTrim(modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(8.dp).clipToBounds()) {
        val step = size.height * 2
        var x = 0f
        var crimson = true
        while (x < size.width) {
            val path =
                Path().apply {
                    moveTo(x, size.height)
                    lineTo(x + step / 2, 0f)
                    lineTo(x + step, size.height)
                    close()
                }
            drawPath(path, if (crimson) Brand.Crimson else Brand.Gold)
            crimson = !crimson
            x += step
        }
    }
}

/** Charcoal header with the seed mark and the restaurant name. */
@Composable
fun BrandHeader() {
    Column(Modifier.fillMaxWidth().background(Brand.Charcoal)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            SeedMark(Modifier.size(36.dp))
            Spacer(Modifier.width(10.dp))
            Column {
                Text(
                    stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge,
                    color = Brand.Cream,
                )
                Text(
                    stringResource(R.string.brand_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = Brand.Gold,
                )
            }
        }
        ZigzagTrim()
    }
}

@Composable
private fun SeedMark(modifier: Modifier) {
    Canvas(modifier) {
        val unit = size.minDimension / 40f
        drawCircle(Brand.Charcoal, radius = 19 * unit)
        drawCircle(
            Brand.Gold,
            radius = 19 * unit,
            style =
                androidx.compose.ui.graphics.drawscope
                    .Stroke(width = unit),
        )
        drawOval(
            Brand.Gold,
            topLeft = Offset(13.8f * unit, 16f * unit),
            size =
                androidx.compose.ui.geometry
                    .Size(12.4f * unit, 15f * unit),
        )
        drawOval(
            Brand.Gold,
            topLeft = Offset(19f * unit, 9f * unit),
            size =
                androidx.compose.ui.geometry
                    .Size(2f * unit, 6.6f * unit),
        )
    }
}

/** Diagonal-stripe placeholder with a small "Photo coming" pill, until real photos exist. */
@Composable
fun PhotoPlaceholder(modifier: Modifier = Modifier) {
    Box(modifier.background(Brand.PlaceholderFill), contentAlignment = Alignment.BottomStart) {
        Canvas(Modifier.fillMaxSize()) {
            val gap = 14.dp.toPx()
            var start = -size.height
            while (start < size.width) {
                drawLine(
                    Brand.PlaceholderStripe,
                    start = Offset(start, size.height),
                    end = Offset(start + size.height, 0f),
                    strokeWidth = 1.dp.toPx(),
                )
                start += gap
            }
        }
        Text(
            stringResource(R.string.photo_coming),
            style = MaterialTheme.typography.labelMedium,
            color = Brand.TextMuted,
            modifier =
                Modifier
                    .padding(12.dp)
                    .background(Brand.PlaceholderPill, RoundedCornerShape(50))
                    .padding(horizontal = 10.dp, vertical = 3.dp),
        )
    }
}
