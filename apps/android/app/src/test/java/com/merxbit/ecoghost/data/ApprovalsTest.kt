package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.ApprovalItemDto
import com.merxbit.ecoghost.data.net.ApprovalLegDto
import com.merxbit.ecoghost.data.net.CategoryDto
import com.merxbit.ecoghost.data.net.EditRequest
import com.merxbit.ecoghost.data.net.NamedDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ApprovalsTest {
    private val gasto = ApprovalItemDto(
        id = "t1", kind = "EXPENSE", status = "PENDING", date = "2026-10-20T16:00:00.000Z", description = "Cemento",
        author = NamedDto("u1", "Pedro"), submittedAt = "2026-10-20T16:00:00.000Z",
        from = ApprovalLegDto("mn", "Efectivo MN", "MN", 640_000), category = CategoryDto("cons", "Construccion"),
    )
    private val cambio = gasto.copy(kind = "EXCHANGE", from = ApprovalLegDto("usd", "Efectivo USD", "USD", 5_000), to = ApprovalLegDto("mn", "Efectivo MN", "MN", 1_950_000))

    @Test fun `sin cambios no se envia nada`() {
        assertNull(ApprovalsRepository.edits(gasto, "Cemento", "6400", "mn", "cons", ""))
    }

    @Test fun `solo lo que cambia`() {
        assertEquals(EditRequest(amount = 600_000), ApprovalsRepository.edits(gasto, "Cemento", "6000", "mn", "cons", ""))
        assertEquals(EditRequest(description = "Cemento P-350", accountId = "bd"), ApprovalsRepository.edits(gasto, " Cemento P-350 ", "6400", "bd", "cons", ""))
        assertEquals(EditRequest(amount = 6_245), ApprovalsRepository.edits(gasto, "Cemento", "62.45", "mn", "cons", ""))
    }

    @Test fun `en un cambio tambien lo recibido`() {
        assertEquals(EditRequest(toAmount = 2_000_000), ApprovalsRepository.edits(cambio, "Cemento", "50", "usd", "cons", "20000"))
        // En un gasto no hay importe recibido aunque venga texto
        assertNull(ApprovalsRepository.edits(gasto, "Cemento", "6400", "mn", "cons", "20000"))
    }

    @Test fun `importe a texto para editar`() {
        assertEquals("6400", ApprovalsRepository.centsText(640_000))
        assertEquals("62,45", ApprovalsRepository.centsText(6_245))
        assertEquals("0,05", ApprovalsRepository.centsText(5))
    }
}
