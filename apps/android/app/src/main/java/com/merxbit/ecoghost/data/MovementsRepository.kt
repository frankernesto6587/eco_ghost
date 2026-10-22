package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.BreakdownDto
import com.merxbit.ecoghost.data.net.DeleteRequest
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.HistoryEntryDto
import com.merxbit.ecoghost.data.net.LegDto
import com.merxbit.ecoghost.data.net.TransactionDto
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/** Lo que muestra el detalle de un movimiento. */
data class MovementDetail(
    val tx: TransactionDto,
    val history: List<HistoryEntryDto>,
    /** De qué cambios sale su valor en la moneda de estadísticas (null si no aplica). */
    val breakdown: BreakdownDto?,
    val reportCurrency: String?,
)

/**
 * Lo que no se puede cambiar al editar: la API no deja convertir un par en
 * gasto, ni cambiar el tipo de un movimiento de deuda, ni las monedas de un
 * cambio. En vez de esperar al error, la hoja no lo ofrece.
 */
data class EditLock(val types: Set<EntryType>, val fromCurrency: String? = null, val toCurrency: String? = null)

/** Detalle, edición y borrado de un movimiento. Lo que cambia algo avisa a Inicio y Movimientos. */
@Singleton
class MovementsRepository @Inject constructor(
    private val api: EcoApi,
    private val finance: FinanceRepository,
) {
    suspend fun detail(id: String): MovementDetail = coroutineScope {
        val tx = async { api.transaction(id) }
        val history = async { runCatching { api.history(id) }.getOrDefault(emptyList()) }
        val valuation = async { runCatching { api.valuationStatus() }.getOrNull() }
        val t = tx.await()
        val report = valuation.await()?.takeIf { it.enabled }?.reportCurrency
        // Como en la web: un gasto o un cambio en otra moneda, en la de estadísticas
        val breakdown = if (report != null && t.account?.currency != report && (t.type == "EXPENSE" || t.type == "EXCHANGE")) {
            runCatching { api.breakdown(t.id) }.getOrNull()
        } else null
        MovementDetail(t, history.await(), breakdown, report)
    }

    suspend fun update(id: String, edits: JsonObject): TransactionDto =
        api.updateTransaction(id, edits).also { finance.notifyChanged() }

    suspend fun delete(id: String, reason: String) {
        api.deleteTransaction(id, DeleteRequest(reason.trim()))
        finance.notifyChanged()
    }

    companion object {
        /** Las dos piernas de un par (la que sale, la que entra), se haya abierto por cualquiera. */
        fun legs(tx: TransactionDto): Pair<LegDto, LegDto>? {
            val self = LegDto(tx.id, tx.amount, tx.accountId, tx.account)
            return when {
                tx.linkedTransaction != null -> self to tx.linkedTransaction
                tx.linkedBy != null -> tx.linkedBy to self
                else -> null
            }
        }

        /** null: no se puede editar desde la app (un par que perdió su otra pierna). */
        fun lock(tx: TransactionDto): EditLock? {
            val legs = legs(tx)
            return when {
                legs != null -> EditLock(setOf(EntryType.TRANSFER), legs.first.account?.currency, legs.second.account?.currency)
                tx.type == "TRANSFER" || tx.type == "EXCHANGE" -> null
                tx.debtId != null -> EditLock(setOf(EntryType.valueOf(tx.type)), tx.account?.currency)
                else -> EditLock(setOf(EntryType.EXPENSE, EntryType.INCOME))
            }
        }

        /**
         * Las cuentas y la categoría que ya tiene el movimiento siempre se pueden
         * elegir, aunque la cuenta esté desactivada o la categoría sea de ajuste.
         */
        fun forEditing(data: EntryData, tx: TransactionDto): EntryData {
            val legs = legs(tx)
            val own = listOfNotNull(tx.account, legs?.first?.account, legs?.second?.account)
                .filter { a -> data.accounts.none { it.id == a.id } }
                .distinctBy { it.id }
                .map { Account(it.id, it.name, it.type, it.currency, 0) }
            val cat = tx.category?.takeIf { it.id !in data.categories }
            val groups = if (cat == null) data.groups else data.groups + CategoryGroup(Category(cat.id, cat.name, cat.icon, cat.color), emptyList())
            return data.copy(accounts = data.accounts + own, groups = groups)
        }

        /**
         * Solo lo que cambió (así el historial guarda cambios reales); null si no
         * cambió nada. Quitar la categoría o la nota va como null explícito.
         */
        fun edits(before: Draft, after: Draft, data: EntryData): JsonObject? {
            val a = EntryRepository.request(after, data)
            val b = EntryRepository.request(before, data)
            val pair = before.type == EntryType.TRANSFER
            val body = buildJsonObject {
                if (a.date != b.date) put("date", a.date)
                if (a.description != b.description) put("description", a.description)
                if (a.amount != b.amount) put("amount", a.amount)
                if (!pair && a.type != b.type) put("type", a.type)
                if (a.accountId != b.accountId) put("accountId", a.accountId)
                if (!pair && a.categoryId != b.categoryId) put("categoryId", a.categoryId?.let(::JsonPrimitive) ?: JsonNull)
                if (a.notes != b.notes) put("notes", a.notes?.let(::JsonPrimitive) ?: JsonNull)
                if (pair && a.toAccountId != b.toAccountId) put("toAccountId", a.toAccountId)
                if (pair && a.toAmount != null && a.toAmount != b.toAmount) put("toAmount", a.toAmount)
            }
            return body.takeIf { it.isNotEmpty() }
        }
    }
}
