package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.CategoryNodeDto
import com.merxbit.ecoghost.data.net.CreateTransactionRequest
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.RateSuggestionDto
import com.merxbit.ecoghost.data.net.TransactionDto
import com.merxbit.ecoghost.data.session.SessionStore
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

enum class EntryType(val label: String) { EXPENSE("Gasto"), INCOME("Ingreso"), TRANSFER("Transferencia") }

data class Category(val id: String, val name: String, val icon: String?, val color: String?, val parentName: String? = null)

/**
 * Una categoría raíz con sus hijas, para el selector "Todas". El grupo decide
 * en qué movimientos sale (gasto, ingreso o los dos) y sus hijas van con él.
 */
data class CategoryGroup(val root: Category, val children: List<Category>, val kind: String = "BOTH") {
    /** Transferencias y cambios no llevan categoría. */
    fun fits(type: String) = (type == "EXPENSE" || type == "INCOME") && (kind == "BOTH" || kind == type)
}

/** Lo que necesita la hoja "Anotar" para abrirse. */
data class EntryData(
    val accounts: List<Account>,
    val groups: List<CategoryGroup>,
    /** Ids de categoría por tipo, de la más usada a la menos (de los últimos movimientos). */
    val usage: Map<EntryType, List<String>>,
    val preferredAccountId: String?,
) {
    val categories: Map<String, Category> = groups.flatMap { listOf(it.root) + it.children }.associateBy { it.id }

    /** Solo los grupos que valen para ese tipo de movimiento ("Salario" no sale en un gasto). */
    fun groupsFor(type: String): List<CategoryGroup> = groups.filter { it.fits(type) }
}

/** Lo que el usuario rellenó en la hoja. Importes en centavos. */
data class Draft(
    val type: EntryType,
    val amount: Long,
    val accountId: String?,
    val toAccountId: String? = null,
    val toAmount: Long = 0,
    val categoryId: String? = null,
    val description: String = "",
    val date: LocalDate = LocalDate.now(),
    val notes: String = "",
)

@Singleton
class EntryRepository @Inject constructor(
    private val api: EcoApi,
    private val store: SessionStore,
    private val finance: FinanceRepository,
) {
    suspend fun load(orgId: String): EntryData = coroutineScope {
        val accounts = async { api.accounts() }
        val categories = async { api.categories() }
        val org = async { runCatching { api.organization(orgId) }.getOrNull() }
        val recent = async { runCatching { api.transactions(limit = 100).data }.getOrDefault(emptyList()) }
        val active = accounts.await().filter { it.isActive }.map { Account(it.id, it.name, it.type, it.currency, 0) }
        // Preselección: la última usada; si no, la por defecto de la organización; si no, la primera
        val preferred = listOfNotNull(store.lastAccount(orgId), org.await()?.defaultAccountId)
            .firstOrNull { id -> active.any { it.id == id } } ?: active.firstOrNull()?.id
        EntryData(active, groups(categories.await()), usage(recent.await()), preferred)
    }

    /**
     * Guarda y avisa a Inicio y Movimientos para que se refresquen. Devuelve el
     * estado con que quedo: PENDING si espera a que lo apruebe un admin.
     */
    suspend fun save(orgId: String, draft: Draft, data: EntryData): String {
        val saved = api.createTransaction(request(draft, data))
        draft.accountId?.let { store.setLastAccount(orgId, it) }
        finance.notifyChanged()
        return saved.status
    }

    /** La tasa de elTOQUE que rige un día, para sugerirla en un cambio (null si no se pudo). */
    suspend fun rates(day: LocalDate): RateSuggestionDto? = runCatching { api.rateSuggestion(day.toString()) }.getOrNull()

    companion object {
        /** Las categorías de ajuste (Saldo inicial) no se eligen a mano. */
        fun groups(tree: List<CategoryNodeDto>): List<CategoryGroup> = tree.filterNot { it.isAdjustment }.map { root ->
            CategoryGroup(
                Category(root.id, root.name, root.icon, root.color),
                root.children.filterNot { it.isAdjustment }.map {
                    // Las hijas heredan icono y color de la raíz si no tienen
                    Category(it.id, it.name, it.icon ?: root.icon, it.color ?: root.color, root.name)
                },
                root.kind,
            )
        }

        fun usage(txs: List<TransactionDto>): Map<EntryType, List<String>> = listOf(EntryType.EXPENSE, EntryType.INCOME).associateWith { type ->
            txs.filter { it.type == type.name }.mapNotNull { it.category?.id }
                .groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.map { it.key }
        }

        /**
         * Convierte la hoja en la petición. Una transferencia entre monedas
         * distintas es un EXCHANGE y lleva el importe recibido. Si no se escribió
         * descripción se usa la categoría (la API la exige).
         */
        fun request(d: Draft, data: EntryData): CreateTransactionRequest {
            val from = data.accounts.first { it.id == d.accountId }
            val to = d.toAccountId?.let { id -> data.accounts.first { it.id == id } }
            val move = d.type == EntryType.TRANSFER
            val exchange = move && to != null && to.currency != from.currency
            val category = if (move) null else d.categoryId?.let(data.categories::get)
            val description = d.description.trim().ifEmpty {
                when {
                    exchange -> "Cambio ${from.currency} a ${to!!.currency}"
                    move -> "Transferencia a ${to?.name.orEmpty()}"
                    else -> category?.name ?: d.type.label
                }
            }
            return CreateTransactionRequest(
                date = d.date.toString(),
                description = description,
                amount = d.amount,
                type = if (exchange) "EXCHANGE" else d.type.name,
                accountId = from.id,
                categoryId = category?.id,
                notes = d.notes.trim().ifEmpty { null },
                toAccountId = if (move) to?.id else null,
                toAmount = if (exchange) d.toAmount else null,
            )
        }

        /** Qué falta para poder guardar, o null si está todo. */
        fun missing(d: Draft, data: EntryData): String? {
            val from = data.accounts.firstOrNull { it.id == d.accountId }
            val to = data.accounts.firstOrNull { it.id == d.toAccountId }
            return when {
                d.amount <= 0 -> "Escribe el importe"
                from == null -> "Elige la cuenta"
                d.type == EntryType.TRANSFER && to == null -> "Elige la cuenta destino"
                d.type == EntryType.TRANSFER && to!!.currency != from.currency && d.toAmount <= 0 -> "Escribe cuánto recibes en ${to.currency}"
                else -> null
            }
        }
    }
}

/** El importe que se teclea en la hoja: "1234,5" → 123450 centavos. */
object AmountInput {
    private const val MAX_DIGITS = 10

    fun press(text: String, key: Char): String = when {
        key == '⌫' -> text.dropLast(1)
        key == ',' -> if (',' in text) text else (text.ifEmpty { "0" } + ",")
        !key.isDigit() -> text
        text == "0" -> key.toString()
        ',' in text && text.substringAfter(',').length >= 2 -> text
        text.substringBefore(',').length >= MAX_DIGITS && ',' !in text -> text
        else -> text + key
    }

    fun cents(text: String): Long {
        if (text.isEmpty()) return 0
        val whole = text.substringBefore(',').ifEmpty { "0" }.toLong()
        val frac = text.substringAfter(',', "").padEnd(2, '0').take(2).toLong()
        return whole * 100 + frac
    }

    /** Cómo se ve mientras se escribe: miles con espacio fino, la coma tal cual. */
    fun display(text: String): String {
        if (text.isEmpty()) return "0"
        val whole = text.substringBefore(',').ifEmpty { "0" }
        val grouped = whole.reversed().chunked(3).joinToString(" ").reversed()
        return if (',' in text) grouped + "," + text.substringAfter(',') else grouped
    }
}
