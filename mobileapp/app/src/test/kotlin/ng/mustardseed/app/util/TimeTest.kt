package ng.mustardseed.app.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.OffsetDateTime

class TimeTest {
    @Test
    fun `formats opening hours like the website`() {
        assertEquals("8am", formatClock("08:00"))
        assertEquals("10:30pm", formatClock("22:30"))
        assertEquals("12pm", formatClock("12:00"))
        assertEquals("12:15am", formatClock("00:15"))
    }

    @Test
    fun `shows order times in West Africa Time`() {
        val utc = OffsetDateTime.parse("2026-10-05T18:45:00Z")
        assertEquals("7:45pm", clockWat(utc))
        assertEquals("5 Oct 2026, 7:45pm", dateTimeWat(utc))
    }
}
