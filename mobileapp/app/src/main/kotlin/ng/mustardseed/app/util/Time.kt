package ng.mustardseed.app.util

import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Opening hours and cut-offs are in West Africa Time (AGENT.md section 8). */
val WAT: ZoneId = ZoneId.of("Africa/Lagos")

/** "08:00" → "8am", "22:30" → "10:30pm" (same as the website). */
fun formatClock(hhmm: String): String {
    val (h, m) = hhmm.split(":").map { it.toInt() }
    val hour12 = if (h % 12 == 0) 12 else h % 12
    val suffix = if (h < 12) "am" else "pm"
    return if (m == 0) "$hour12$suffix" else "$hour12:${m.toString().padStart(2, '0')}$suffix"
}

/** A moment shown as a WAT clock time, e.g. "7:45pm". */
fun clockWat(time: OffsetDateTime): String {
    val local = time.atZoneSameInstant(WAT)
    return formatClock("%02d:%02d".format(Locale.US, local.hour, local.minute))
}

/** e.g. "5 Oct 2026, 12:05pm" in WAT. */
fun dateTimeWat(time: OffsetDateTime): String =
    time.atZoneSameInstant(WAT).format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.UK)) + ", " + clockWat(time)
