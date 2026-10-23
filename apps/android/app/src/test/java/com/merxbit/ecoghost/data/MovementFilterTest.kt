package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.CategoryNodeDto
import com.merxbit.ecoghost.data.net.SummaryDto
import com.merxbit.ecoghost.data.net.SummaryReportDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

class MovementFilterTest {
    private val havana = ZoneId.of("America/Havana")
    private val today = LocalDate.of(2026, 10, 23)
    private val groups = MovementFilters.groups(
        listOf(
            CategoryNodeDto("ali", "Alimentacion", kind = "EXPENSE", children = listOf(CategoryNodeDto("mer", "Mercado"), CategoryNodeDto("agro", "Agro"))),
            CategoryNodeDto("aj", "Ajustes", isAdjustment = true, children = listOf(CategoryNodeDto("corr", "Correccion", isAdjustment = true))),
        ),
    )

    @Test fun `sin filtros no se envia nada`() {
        assertEquals(FilterQuery(), MovementFilters.query(MovementFilter(), groups, havana))
        assertFalse(MovementFilter().isActive)
        assertFalse(MovementFilter(search = "   ").isActive)
        assertTrue(MovementFilter(search = "cafe").isActive)
    }

    @Test fun `un mes va del primer al ultimo milisegundo en hora de Cuba`() {
        val q = MovementFilters.query(MovementFilter(period = Period.Month(YearMonth.of(2026, 9))), groups, havana)
        assertEquals("2026-09-01T04:00:00Z", q.from)
        assertEquals("2026-10-01T03:59:59.999Z", q.to)
    }

    @Test fun `un rango de un solo dia es ese dia entero`() {
        val d = LocalDate.of(2026, 10, 5)
        val q = MovementFilters.query(MovementFilter(period = Period.Range(d, d)), groups, havana)
        assertEquals("2026-10-05T04:00:00Z", q.from)
        assertEquals("2026-10-06T03:59:59.999Z", q.to)
    }

    @Test fun `un grupo incluye sus hijas y una hija va sola`() {
        assertEquals("ali,mer,agro", MovementFilters.query(MovementFilter(categoryId = "ali"), groups).categoryId)
        assertEquals("agro", MovementFilters.query(MovementFilter(categoryId = "agro"), groups).categoryId)
        // Las de ajuste tambien se pueden buscar
        assertEquals("aj,corr", MovementFilters.query(MovementFilter(categoryId = "aj"), groups).categoryId)
    }

    @Test fun `tipo, cuenta, estado y busqueda tal cual`() {
        val q = MovementFilters.query(
            MovementFilter(TypeFilter.EXCHANGE, accountId = "mn", status = StatusFilter.PENDING, search = "  cafe  "), groups,
        )
        assertEquals(FilterQuery(type = "EXCHANGE", accountId = "mn", status = "PENDING", search = "cafe"), q)
    }

    @Test fun `nombres de los periodos`() {
        assertEquals("Octubre", MovementFilters.periodLabel(Period.Month(YearMonth.of(2026, 10)), today))
        assertEquals("Diciembre 2025", MovementFilters.periodLabel(Period.Month(YearMonth.of(2025, 12)), today))
        assertEquals("3 oct – 15 oct", MovementFilters.periodLabel(Period.Range(LocalDate.of(2026, 10, 3), LocalDate.of(2026, 10, 15)), today))
        assertEquals("5 oct", MovementFilters.periodLabel(Period.Range(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 5)), today))
        assertEquals(YearMonth.of(2025, 11), MovementFilters.recentMonths(today).last())
    }

    @Test fun `neto del dia por moneda, solo lo que cuenta`() {
        fun m(type: String, amount: Long, cur: String, counts: Boolean = true) =
            Movement("x", today, "x", type, amount, cur, "c", null, null, null, inTotals = counts)
        val day = listOf(
            m("EXPENSE", 640_000, "MN"), m("EXPENSE", 100_000, "MN"), m("INCOME", 40_000, "USD"),
            m("EXPENSE", 999_900, "MN", counts = false),
        )
        assertEquals("−7 400 MN · +400 USD", MovementFilters.dayTotals(day))
        assertEquals("", MovementFilters.dayTotals(listOf(m("TRANSFER", 100, "MN", counts = false))))
    }

    @Test fun `el resumen de arriba`() {
        val s = SummaryDto(
            expense = mapOf("MN" to 4_530_000, "USD" to 12_000), income = mapOf("USD" to 40_000), count = 32,
            report = SummaryReportDto("USD", income = 40_000, expense = 19_550, incomplete = 2),
        )
        assertEquals(
            listOf("32 movimientos", "Gastos: 45\u202f300\u00a0MN · 120\u00a0USD ≈\u00a0195,50\u00a0USD", "Ingresos: 400\u00a0USD", "2 sin tasa: no suman en USD"),
            MovementFilters.summaryLines(s, StatusFilter.DEFAULT),
        )
        assertEquals(listOf("12 movimientos · no cuentan en los totales"), MovementFilters.summaryLines(s.copy(count = 12), StatusFilter.PENDING))
        assertEquals(listOf("3 movimientos · ninguno es gasto o ingreso"), MovementFilters.summaryLines(SummaryDto(count = 3), StatusFilter.DEFAULT))
        assertEquals(listOf("0 movimientos"), MovementFilters.summaryLines(SummaryDto(), StatusFilter.DEFAULT))
        assertEquals(listOf("1 movimiento", "Gastos: 64\u00a0MN"), MovementFilters.summaryLines(SummaryDto(expense = mapOf("MN" to 6_400), count = 1), StatusFilter.DEFAULT))
    }
}
