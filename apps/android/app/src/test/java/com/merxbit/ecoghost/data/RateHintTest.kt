package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.RateSuggestionDto
import com.merxbit.ecoghost.data.net.SuggestedRateDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class RateHintTest {
    private val day = LocalDate.parse("2026-10-20")
    private val rates = RateSuggestionDto(
        "2026-10-20",
        mapOf(
            "USD" to SuggestedRateDto(810.0, "2026-10-20"),
            "EUR" to SuggestedRateDto(887.54, "2026-10-20"),
            "MLC" to SuggestedRateDto(569.83, "2026-10-19", "MANUAL"),
        ),
    )

    @Test fun `USD a MN, con el tuyo por debajo`() {
        val h = RateHints.exchange("USD", "MN", rates, 10_000, 8_000_000, day)!!
        assertEquals("elTOQUE 20/10: 1 USD = 810 MN", h.market)
        assertEquals("el tuyo: 1 USD = 800 MN · 1,2 % menos", h.mine)
        assertEquals(8_100_000L, h.suggested)
    }

    @Test fun `MN a USD se cita igual, en la moneda que mas vale`() {
        val h = RateHints.exchange("MN", "USD", rates, 8_100_000, 10_000, day)!!
        assertEquals("elTOQUE 20/10: 1 USD = 810 MN", h.market)
        assertEquals("el tuyo: 1 USD = 810 MN · igual", h.mine)
        assertNull(h.suggested) // ya es lo que sale a esa tasa
    }

    @Test fun `tasa cruzada, puesta a mano y de un dia anterior`() {
        val h = RateHints.exchange("USD", "MLC", rates, 10_000, 0, day)!!
        assertEquals("Tasa del 19/10 (la última), puesta a mano: 1 USD = 1,42 MLC", h.market)
        assertNull(h.mine)
        assertEquals(14_215L, h.suggested)
    }

    @Test fun `sin tasa de esa moneda no hay sugerencia`() {
        assertNull(RateHints.exchange("USDT", "MN", rates, 10_000, 0, day))
        assertNull(RateHints.exchange("USD", "MN", null, 10_000, 0, day))
    }
}
