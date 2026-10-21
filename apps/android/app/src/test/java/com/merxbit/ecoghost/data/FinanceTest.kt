package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.AccountDto
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

    @Test fun `la pata de entrada sin su salida en la pagina no se muestra suelta`() {
        val list = FinanceRepository.movements(listOf(tx("in", "TRANSFER", 100, mn)))
        assertEquals(emptyList<Movement>(), list)
    }
}
