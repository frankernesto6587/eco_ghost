package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.CategoryDto
import com.merxbit.ecoghost.data.net.CategoryNodeDto
import com.merxbit.ecoghost.data.net.TransactionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class AmountInputTest {
    private fun type(keys: String) = keys.fold("") { t, k -> AmountInput.press(t, k) }

    @Test fun `teclear importes`() {
        assertEquals("6400", type("6400"))
        assertEquals("62,45", type("62,456"))
        assertEquals("0,5", type(",5"))
        assertEquals("7", type("07"))
        assertEquals("12,", type("12,,"))
        assertEquals("1", type("12⌫"))
    }

    @Test fun `a centavos y a texto`() {
        assertEquals(640_000, AmountInput.cents("6400"))
        assertEquals(6_245, AmountInput.cents("62,45"))
        assertEquals(50, AmountInput.cents("0,5"))
        assertEquals(1_200, AmountInput.cents("12,"))
        assertEquals(0, AmountInput.cents(""))
        assertEquals("1 575 763,9", AmountInput.display("1575763,9"))
        assertEquals("0", AmountInput.display(""))
    }
}

class EntryRequestTest {
    private val mn = Account("mn", "Efectivo MN", "CASH", "MN", 0)
    private val bandec = Account("bd", "BANDEC", "BANK", "MN", 0)
    private val usd = Account("usd", "Efectivo USD", "CASH", "USD", 0)
    private val tree = listOf(
        CategoryNodeDto("ali", "Alimentacion", "coffee", "#fa7c20", children = listOf(CategoryNodeDto("mer", "Mercado", null, null, parentId = "ali"))),
        CategoryNodeDto("ini", "Saldo inicial", "bank", null, isAdjustment = true),
    )
    private val data = EntryData(listOf(mn, bandec, usd), EntryRepository.groups(tree), emptyMap(), "mn")
    private val day = LocalDate.of(2026, 10, 20)

    @Test fun `las de ajuste no se ofrecen y las hijas heredan icono y color`() {
        assertEquals(listOf("Alimentacion"), data.groups.map { it.root.name })
        assertEquals("coffee", data.categories["mer"]?.icon)
        assertEquals("#fa7c20", data.categories["mer"]?.color)
    }

    @Test fun `gasto sin descripcion usa la categoria`() {
        val r = EntryRepository.request(Draft(EntryType.EXPENSE, 640_000, "mn", categoryId = "mer", date = day), data)
        assertEquals("EXPENSE", r.type)
        assertEquals("Mercado", r.description)
        assertEquals("2026-10-20", r.date)
        assertEquals("mer", r.categoryId)
        assertNull(r.toAccountId)
    }

    @Test fun `transferencia en la misma moneda`() {
        val r = EntryRepository.request(Draft(EntryType.TRANSFER, 3_500_000, "bd", "mn", categoryId = "mer"), data)
        assertEquals("TRANSFER", r.type)
        assertEquals("mn", r.toAccountId)
        assertNull(r.toAmount)
        assertNull(r.categoryId)
        assertEquals("Transferencia a Efectivo MN", r.description)
    }

    @Test fun `entre monedas distintas es un cambio con importe recibido`() {
        val d = Draft(EntryType.TRANSFER, 10_000, "usd", "mn", toAmount = 3_800_000)
        val r = EntryRepository.request(d, data)
        assertEquals("EXCHANGE", r.type)
        assertEquals(3_800_000L, r.toAmount)
        assertEquals("Cambio USD a MN", r.description)
        assertEquals("Escribe cuánto recibes en MN", EntryRepository.missing(d.copy(toAmount = 0), data))
        assertNull(EntryRepository.missing(d, data))
    }

    @Test fun `que falta para guardar`() {
        assertEquals("Escribe el importe", EntryRepository.missing(Draft(EntryType.EXPENSE, 0, "mn"), data))
        assertEquals("Elige la cuenta", EntryRepository.missing(Draft(EntryType.EXPENSE, 100, null), data))
        assertEquals("Elige la cuenta destino", EntryRepository.missing(Draft(EntryType.TRANSFER, 100, "mn"), data))
    }

    @Test fun `las mas usadas por tipo`() {
        fun tx(type: String, cat: String) = TransactionDto("x", "2026-10-20", "x", 1, type, "mn", category = CategoryDto(cat, cat))
        val u = EntryRepository.usage(listOf(tx("EXPENSE", "a"), tx("EXPENSE", "b"), tx("EXPENSE", "b"), tx("INCOME", "s")))
        assertEquals(listOf("b", "a"), u[EntryType.EXPENSE])
        assertEquals(listOf("s"), u[EntryType.INCOME])
    }
}
