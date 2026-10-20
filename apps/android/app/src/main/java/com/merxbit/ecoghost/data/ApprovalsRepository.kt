package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.ApprovalItemDto
import com.merxbit.ecoghost.data.net.ApproveRequest
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.EditRequest
import com.merxbit.ecoghost.data.net.RejectRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bandeja de aprobaciones. Todo lo que cambia un estado avisa a Inicio y
 * Movimientos: aprobar mueve saldos y lo pendiente deja de mostrarse.
 */
@Singleton
class ApprovalsRepository @Inject constructor(
    private val api: EcoApi,
    private val finance: FinanceRepository,
) {
    /** "review": lo que espera revision (propietario/admin). "mine": lo que envie yo. */
    suspend fun list(scope: String) = api.approvals(scope)

    suspend fun approve(id: String, edits: EditRequest?) = changed { api.approve(id, ApproveRequest(edits)) }
    suspend fun reject(id: String, reason: String) = changed { api.reject(id, RejectRequest(reason.trim())) }
    suspend fun edit(id: String, edits: EditRequest) = changed { api.editMine(id, edits) }
    suspend fun resubmit(id: String) = changed { api.resubmit(id) }
    suspend fun withdraw(id: String) = changed { api.withdraw(id) }

    private suspend fun <T> changed(block: suspend () -> T): T = block().also { finance.notifyChanged() }

    companion object {
        /**
         * Solo lo que cambio respecto a lo enviado (asi el historial guarda
         * correcciones reales). null si no cambio nada.
         */
        fun edits(
            item: ApprovalItemDto,
            description: String,
            amount: String,
            accountId: String?,
            categoryId: String?,
            toAmount: String,
        ): EditRequest? {
            val cents = AmountInput.cents(normalize(amount))
            val toCents = AmountInput.cents(normalize(toAmount))
            val e = EditRequest(
                description = description.trim().takeIf { it.isNotEmpty() && it != item.description },
                amount = cents.takeIf { it > 0 && it != item.from.amount },
                accountId = accountId?.takeIf { it != item.from.accountId },
                categoryId = categoryId?.takeIf { it != item.category?.id },
                toAmount = toCents.takeIf { item.kind == "EXCHANGE" && it > 0 && it != item.to?.amount },
            )
            return e.takeIf { it != EditRequest() }
        }

        /** Texto para editar un importe: 640000 → "6400", 6245 → "62,45". */
        fun centsText(cents: Long): String {
            val whole = cents / 100
            val frac = cents % 100
            return if (frac == 0L) whole.toString() else "$whole,${frac.toString().padStart(2, '0')}"
        }

        private fun normalize(s: String) = s.trim().replace('.', ',').filter { it.isDigit() || it == ',' }
    }
}
