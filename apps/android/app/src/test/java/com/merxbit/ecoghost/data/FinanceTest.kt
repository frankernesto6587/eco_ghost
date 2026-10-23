package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.AccountDto
import com.merxbit.ecoghost.data.net.CategoryDto
import com.merxbit.ecoghost.data.net.LegDto
import com.merxbit.ecoghost.data.net.TransactionDto
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class MoneyTest {
    @Test fun `miles con espacio fino y centavos solo si existen`() {
        assertEquals("1 575 763", Money.format(157_576_300))
        assertEquals("1 862,91", Money.format(186_291))
        assertEquals("0", Money.format(0))
        assertEquals("−45,05", Money.format(-4_505))
        assertEquals("330 MLC", Money.format(33_000, "MLC"))
    }

    @Test fun `fechas relativas`() {
        val today = LocalDate.of(2026, 10, 16)
        assertEquals("Hoy", Dates.label(today, today))
        assertEquals("Ayer", Dates.label(today.minusDays(1), today))
        assertEquals("Mié 14 oct", Dates.label(today.minusDays(2), today))
        assertEquals("Mié 31 dic 2025", Dates.label(LocalDate.of(2025, 12, 31), today))
    }
}

class MovementsTest {
    private val usd = AccountDto("a1", "Efectivo USD", "CASH", "USD")
    private val mn = AccountDto("a2", "Efectivo MN", "CASH", "MN")
    private fun tx(id: String, type: String, amount: Long, acc: AccountDto, linked: String? = null) =
        TransactionDto(id, "2026-10-16T12:00:00.000Z", "x", amount, type, acc.id, linked, account = acc)

    @Test fun `un cambio de moneda es una sola fila con lo que sale y lo que entra`() {
        val list = FinanceRepository.movements(
            listOf(
                tx("in", "EXCHANGE", 3_800_000, mn),
                tx("out", "EXCHANGE", 10_000, usd, linked = "in"),
                tx("g", "EXPENSE", 500, usd),
            ),
        )
        assertEquals(listOf("out", "g"), list.map { it.id })
        val ex = list.first()
        assertEquals("Efectivo USD", ex.accountName)
        assertEquals("Efectivo MN", ex.toAccountName)
        assertEquals(3_800_000L, ex.toAmount)
        assertEquals("MN", ex.toCurrency)
    }

    @Test fun `una pata huerfana de datos viejos no se muestra`() {
        val list = FinanceRepository.movements(listOf(tx("in", "TRANSFER", 100, mn)))
        assertEquals(emptyList<Movement>(), list)
    }

    @Test fun `si solo llega la pata que entra, la fila sale igual y con el id de la que sale`() {
        // Al filtrar por la cuenta destino, o con la otra pata en la pagina siguiente
        val inc = tx("in", "EXCHANGE", 3_800_000, mn).copy(linkedBy = LegDto("out", 10_000, usd.id, usd))
        val alone = FinanceRepository.movements(listOf(inc)).single()
        assertEquals("out", alone.id)
        assertEquals("Efectivo USD", alone.accountName)
        assertEquals(10_000L, alone.amount)
        assertEquals("Efectivo MN", alone.toAccountName)
        assertEquals(3_800_000L, alone.toAmount)
        // Cuando llega la otra no se duplica
        val both = FinanceRepository.movements(listOf(inc, tx("out", "EXCHANGE", 10_000, usd, linked = "in")))
        assertEquals(listOf("out"), both.map { it.id })
    }

    @Test fun `la pata que sale sin la otra en la pagina toma el destino de linkedTransaction`() {
        val out = tx("out", "TRANSFER", 500_000, usd, linked = "in").copy(linkedTransaction = LegDto("in", 500_000, "a3", AccountDto("a3", "Zelle", "BANK", "USD")))
        assertEquals("Zelle", FinanceRepository.movements(listOf(out)).single().toAccountName)
    }

    @Test fun `solo cuenta en los totales lo aprobado, sin deudas ni ajustes`() {
        val list = FinanceRepository.movements(
            listOf(
                tx("g", "EXPENSE", 500, mn),
                tx("p", "EXPENSE", 500, mn).copy(status = "PENDING"),
                tx("d", "EXPENSE", 500, mn).copy(debtId = "d1"),
                tx("a", "INCOME", 500, mn).copy(category = CategoryDto("c", "Saldo inicial", isAdjustment = true)),
                tx("in", "TRANSFER", 500, mn).copy(linkedBy = LegDto("out", 500, usd.id, usd)),
            ),
        )
        assertEquals(listOf("g"), list.filter { it.inTotals }.map { it.id })
    }
}
