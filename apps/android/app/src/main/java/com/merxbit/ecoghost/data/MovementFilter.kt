package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.CategoryNodeDto
import com.merxbit.ecoghost.data.net.SummaryDto
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** Los chips de tipo de Movimientos. */
enum class TypeFilter(val label: String, val api: String?) {
    ALL("Todos", null),
    EXPENSE("Gastos", "EXPENSE"),
    INCOME("Ingresos", "INCOME"),
    TRANSFER("Transf.", "TRANSFER"),
    EXCHANGE("Cambios", "EXCHANGE"),
}

/** Por defecto, como la API: lo aprobado y lo pendiente (lo rechazado solo si se pide). */
enum class StatusFilter(val label: String, val chip: String, val api: String?) {
    DEFAULT("Aprobados y pendientes", "Estado", null),
    APPROVED("Solo aprobados", "Aprobados", "APPROVED"),
    PENDING("Pendientes de aprobar", "Pendientes", "PENDING"),
    REJECTED("Rechazados", "Rechazados", "REJECTED"),
}

sealed interface Period {
    data object All : Period
    data class Month(val month: YearMonth) : Period
    data class Range(val from: LocalDate, val to: LocalDate) : Period
}

data class MovementFilter(
    val type: TypeFilter = TypeFilter.ALL,
    val accountId: String? = null,
    val categoryId: String? = null,
    val period: Period = Period.All,
    val status: StatusFilter = StatusFilter.DEFAULT,
    val search: String = "",
) {
    /** Hay algo que filtra: entonces se muestran los totales arriba. */
    val isActive: Boolean get() = copy(search = search.trim()) != MovementFilter()
}

/** Lo que va a la API; lo que está en null no se envía. */
data class FilterQuery(
    val from: String? = null,
    val to: String? = null,
    val type: String? = null,
    val accountId: String? = null,
    val categoryId: String? = null,
    val status: String? = null,
    val search: String? = null,
)

object MovementFilters {
    fun query(f: MovementFilter, groups: List<CategoryGroup>, zone: ZoneId = ZoneId.systemDefault()): FilterQuery {
        val (from, to) = when (val p = f.period) {
            Period.All -> null to null
            is Period.Month -> p.month.atDay(1) to p.month.atEndOfMonth()
            is Period.Range -> p.from to p.to
        }
        return FilterQuery(
            from = from?.atStartOfDay(zone)?.toInstant()?.toString(),
            // Hasta el último milisegundo de ese día (la API compara con <=)
            to = to?.plusDays(1)?.atStartOfDay(zone)?.toInstant()?.minusMillis(1)?.toString(),
            type = f.type.api,
            accountId = f.accountId,
            categoryId = f.categoryId?.let { categoryIds(it, groups).joinToString(",") },
            status = f.status.api,
            search = f.search.trim().ifEmpty { null },
        )
    }

    /** Un grupo incluye sus hijas: "Alimentación" es también "Mercado" y "Agro". */
    fun categoryIds(id: String, groups: List<CategoryGroup>): List<String> =
        groups.firstOrNull { it.root.id == id }?.let { g -> listOf(g.root.id) + g.children.map { it.id } } ?: listOf(id)

    /**
     * Para filtrar sí salen las de ajuste (Saldo inicial, Corrección): al
     * anotar no se eligen, pero hay que poder encontrarlas.
     */
    fun groups(tree: List<CategoryNodeDto>): List<CategoryGroup> = tree.map { root ->
        CategoryGroup(
            Category(root.id, root.name, root.icon, root.color),
            root.children.map { Category(it.id, it.name, it.icon ?: root.icon, it.color ?: root.color, root.name) },
            root.kind,
        )
    }

    /** "Octubre", "Diciembre 2025", "3 oct – 15 oct". */
    fun periodLabel(p: Period, today: LocalDate = LocalDate.now()): String = when (p) {
        Period.All -> "Todo"
        is Period.Month -> Dates.MESES_LARGOS[p.month.monthValue - 1] + if (p.month.year != today.year) " ${p.month.year}" else ""
        is Period.Range -> if (p.from == p.to) short(p.from, today) else "${short(p.from, today)} – ${short(p.to, today)}"
    }

    private fun short(d: LocalDate, today: LocalDate) =
        "${d.dayOfMonth} ${Dates.MESES[d.monthValue - 1]}" + if (d.year != today.year) " ${d.year}" else ""

    /** Los meses del selector: el actual y los once anteriores. */
    fun recentMonths(today: LocalDate = LocalDate.now()): List<YearMonth> =
        (0L until 12L).map { YearMonth.from(today).minusMonths(it) }

    /** Neto del día por moneda, como en la maqueta: "+400 USD · −6 400 MN". Solo lo que cuenta. */
    fun dayTotals(list: List<Movement>): String = list.filter { it.inTotals }
        .groupBy { it.currency }
        .mapValues { (_, ms) -> ms.sumOf { if (it.type == "INCOME") it.amount else -it.amount } }
        .filterValues { it != 0L }
        .entries.joinToString(" · ") { (cur, v) -> (if (v > 0) "+" else "") + Money.format(v, cur) }

    /**
     * El resumen de arriba, en líneas:
     * "32 movimientos", "Gastos: 45 300 MN · 120 USD ≈ 195,50 USD", "Ingresos: 400 USD".
     */
    fun summaryLines(s: SummaryDto, status: StatusFilter): List<String> {
        val head = if (s.count == 1) "1 movimiento" else "${s.count} movimientos"
        if (status == StatusFilter.PENDING || status == StatusFilter.REJECTED) return listOf("$head · no cuentan en los totales")
        val report = s.report
        fun line(label: String, byCurrency: Map<String, Long>, market: Long?): String? {
            val parts = byCurrency.filterValues { it != 0L }
            if (parts.isEmpty()) return null
            // Cada importe con su moneda no se parte entre dos líneas
            fun money(v: Long, cur: String) = Money.format(v, cur).replace(' ', '\u00a0')
            val native = parts.entries.joinToString(" · ") { (cur, v) -> money(v, cur) }
            // El ≈ solo aporta si hay algo en otra moneda
            val approx = if (report != null && market != null && parts.keys != setOf(report.currency)) " ≈\u00a0${money(market, report.currency)}" else ""
            return "$label: $native$approx"
        }
        val lines = listOfNotNull(
            line("Gastos", s.expense, report?.expense),
            line("Ingresos", s.income, report?.income),
        )
        if (lines.isEmpty()) return listOf(if (s.count == 0) head else "$head · ninguno es gasto o ingreso")
        val missing = report?.incomplete?.takeIf { it > 0 }?.let { n ->
            if (n == 1) "1 sin tasa: no suma en ${report.currency}" else "$n sin tasa: no suman en ${report.currency}"
        }
        return listOf(head) + lines + listOfNotNull(missing)
    }
}
