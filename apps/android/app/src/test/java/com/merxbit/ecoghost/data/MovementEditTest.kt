package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.AccountDto
import com.merxbit.ecoghost.data.net.BreakdownLotDto
import com.merxbit.ecoghost.data.net.BreakdownPartDto
import com.merxbit.ecoghost.data.net.CategoryDto
import com.merxbit.ecoghost.data.net.CategoryNodeDto
import com.merxbit.ecoghost.data.net.HistoryChangeDto
import com.merxbit.ecoghost.data.net.HistoryEntryDto
import com.merxbit.ecoghost.data.net.LegDto
import com.merxbit.ecoghost.data.net.NamedDto
import com.merxbit.ecoghost.data.net.TransactionDto
import com.merxbit.ecoghost.ui.entry.EntryForm
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class MovementEditTest {
    private val mnDto = AccountDto("mn", "Efectivo MN", "CASH", "MN")
    private val usdDto = AccountDto("usd", "Efectivo USD", "CASH", "USD")
    private val oldDto = AccountDto("old", "Caja vieja", "CASH", "MN", isActive = false)
    private val data = EntryData(
        accounts = listOf(Account("mn", "Efectivo MN", "CASH", "MN", 0), Account("bd", "BANDEC", "BANK", "MN", 0), Account("usd", "Efectivo USD", "CASH", "USD", 0)),
        groups = EntryRepository.groups(
            listOf(
                CategoryNodeDto("ali", "Alimentacion", kind = "EXPENSE", children = listOf(CategoryNodeDto("mer", "Mercado"), CategoryNodeDto("agro", "Agro"))),
                CategoryNodeDto("ing", "Ingresos", kind = "INCOME", children = listOf(CategoryNodeDto("sal", "Salario"))),
            ),
        ),
        usage = emptyMap(),
        preferredAccountId = "mn",
    )
    private val gasto = TransactionDto(
        "g1", "2026-10-21T16:00:00.000Z", "agro", 640_000, "EXPENSE", "mn",
        category = CategoryDto("mer", "Mercado"), account = mnDto, notes = "con Lidice",
    )
    // Un cambio abierto desde la pierna que entra
    private val entrada = TransactionDto(
        "in", "2026-10-03T16:00:00.000Z", "Cambio USD a MN", 3_800_000, "EXCHANGE", "mn", account = mnDto,
        linkedBy = LegDto("out", 10_000, "usd", usdDto),
    )

    @Test fun `un cambio se edita desde la pierna que sale aunque se abra por la otra`() {
        val f = EntryForm.of(entrada)
        assertEquals(EntryType.TRANSFER, f.type)
        assertEquals("100", f.amount)
        assertEquals("38000", f.toAmount)
        assertEquals("usd", f.accountId)
        assertEquals("mn", f.toAccountId)
        assertEquals(EditLock(setOf(EntryType.TRANSFER), "USD", "MN"), MovementsRepository.lock(entrada))
    }

    @Test fun `solo se envia lo que cambio y quitar la categoria o la nota va como null`() {
        val before = EntryForm.of(gasto).draft()
        assertNull(MovementsRepository.edits(before, before, data))

        val after = before.copy(amount = 650_000, categoryId = null, notes = "")
        assertEquals(
            buildJsonObject { put("amount", 650_000); put("categoryId", JsonNull); put("notes", JsonNull) },
            MovementsRepository.edits(before, after, data),
        )
        // De gasto a ingreso, con su categoria nueva
        val income = before.copy(type = EntryType.INCOME, categoryId = "sal")
        assertEquals(
            buildJsonObject { put("type", "INCOME"); put("categoryId", JsonPrimitive("sal")) },
            MovementsRepository.edits(before, income, data),
        )
    }

    @Test fun `en un par nunca va el tipo, y si cambia lo que se recibe va toAmount`() {
        val before = EntryForm.of(entrada).draft()
        val after = before.copy(amount = 20_000, toAmount = 7_000_000, date = LocalDate.of(2026, 10, 4))
        assertEquals(
            buildJsonObject { put("date", "2026-10-04"); put("amount", 20_000); put("toAmount", 7_000_000) },
            MovementsRepository.edits(before, after, data),
        )
    }

    @Test fun `la cuenta desactivada y la categoria de ajuste del movimiento se pueden elegir`() {
        val ajuste = gasto.copy(accountId = "old", account = oldDto, category = CategoryDto("corr", "Correccion"), debtId = null)
        val d = MovementsRepository.forEditing(data, ajuste)
        assertEquals(listOf("mn", "bd", "usd", "old"), d.accounts.map { it.id })
        assertEquals("Correccion", d.categories["corr"]?.name)
        // Y al guardar sin tocarla, la categoria no se pierde
        val before = EntryForm.of(ajuste).draft()
        assertNull(MovementsRepository.edits(before, before, d))
    }

    @Test fun `un movimiento de deuda no cambia de tipo ni de moneda`() {
        assertEquals(EditLock(setOf(EntryType.EXPENSE), "MN"), MovementsRepository.lock(gasto.copy(debtId = "d1")))
        assertEquals(EditLock(setOf(EntryType.EXPENSE, EntryType.INCOME)), MovementsRepository.lock(gasto))
        // Un par que perdio su otra pierna no se edita desde la app
        assertNull(MovementsRepository.lock(entrada.copy(linkedBy = null)))
    }
}

class HistoryTextTest {
    @Test fun `quien hizo que`() {
        assertEquals("Anotó Lidice · por Telegram", HistoryText.title(HistoryEntryDto("CREATE", "2026-10-21T18:00:00.000Z", NamedDto("u", "Lidice"), source = "telegram")))
        val corr = HistoryChangeDto("amount", JsonPrimitive(640_000), JsonPrimitive(650_000), "MN")
        assertEquals("Aprobó Frank con correcciones", HistoryText.title(HistoryEntryDto("APPROVE", "2026-10-21T20:00:00.000Z", NamedDto("f", "Frank"), changes = listOf(corr))))
        assertEquals("Aprobó Frank", HistoryText.title(HistoryEntryDto("APPROVE", "2026-10-21T20:00:00.000Z", NamedDto("f", "Frank"))))
    }

    @Test fun `lo que cambio, legible`() {
        assertEquals("Importe: 6 400 MN → 6 500 MN", HistoryText.change(HistoryChangeDto("amount", JsonPrimitive(640_000), JsonPrimitive(650_000), "MN")))
        assertEquals("Categoría: Mercado → —", HistoryText.change(HistoryChangeDto("category", JsonPrimitive("Mercado"), JsonNull)))
        assertEquals("Categoría: — → Agro", HistoryText.change(HistoryChangeDto("category", null, JsonPrimitive("Agro"))))
        assertEquals("Tipo: Gasto → Ingreso", HistoryText.change(HistoryChangeDto("type", JsonPrimitive("EXPENSE"), JsonPrimitive("INCOME"))))
    }

    @Test fun `de que cambio salio el valor`() {
        val lot = BreakdownLotDto("EXCHANGE", "2026-10-01T00:00:00.000Z", rate = 600.0, marketRate = 612.5)
        assertEquals("6 400 MN · cambio del 01/10 a 600 (mercado 612,5)", HistoryText.part(BreakdownPartDto("LOT", "MN", 640_000, lot)))
        assertEquals("1 000 MN · sin bolsa: estimado a la tasa del día", HistoryText.part(BreakdownPartDto("DEFICIT", "MN", 100_000)))
    }
}
