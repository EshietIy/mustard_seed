package ng.mustardseed.app.util

import org.junit.Assert.assertEquals
import org.junit.Test

class NairaTest {
    @Test
    fun `formats kobo as naira with thousands separators`() {
        assertEquals("₦4,500", formatNaira(450_000))
        assertEquals("₦1,234,567", formatNaira(123_456_700))
        assertEquals("₦0", formatNaira(0))
    }

    @Test
    fun `shows kobo only when there are some`() {
        assertEquals("₦4,500.50", formatNaira(450_050))
    }

    @Test
    fun `shows the placeholder when the price is not set yet`() {
        assertEquals("[PRICE]", priceLabel(null))
        assertEquals("₦800", priceLabel(80_000))
    }
}
