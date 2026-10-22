package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.BreakdownPartDto
import com.merxbit.ecoghost.data.net.HistoryChangeDto
import com.merxbit.ecoghost.data.net.HistoryEntryDto
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.util.Locale

/** Cómo se lee el historial de un movimiento. */
object HistoryText {
    private val ACTIONS = mapOf(
        "CREATE" to "Anotó", "UPDATE" to "Editó", "APPROVE" to "Aprobó", "REJECT" to "Rechazó",
        "RESUBMIT" to "Reenvió", "EDIT_PENDING" to "Corrigió", "WITHDRAW" to "Retiró",
        "DELETE" to "Borró", "RESTORE" to "Restauró", "BULK_UPDATE" to "Cambió en lote", "BULK_DELETE" to "Borró en lote",
    )
    private val FIELDS = mapOf(
        "date" to "Fecha", "description" to "Descripción", "amount" to "Importe", "type" to "Tipo",
        "account" to "Cuenta", "category" to "Categoría", "notes" to "Nota", "toAccount" to "Cuenta destino", "toAmount" to "Recibe",
    )
    val TYPES = mapOf("EXPENSE" to "Gasto", "INCOME" to "Ingreso", "TRANSFER" to "Transferencia", "EXCHANGE" to "Cambio")

    /** "Anotó Lidice · por Telegram", "Aprobó Frank con correcciones". */
    fun title(e: HistoryEntryDto): String {
        val extra = when {
            e.action == "CREATE" && e.source == "telegram" -> " · por Telegram"
            e.action == "APPROVE" && e.changes.isNotEmpty() -> " con correcciones"
            else -> ""
        }
        return "${ACTIONS[e.action] ?: e.action} ${e.user?.name ?: "alguien"}$extra"
    }

    /** "Importe: 6 400 MN → 6 500 MN". */
    fun change(c: HistoryChangeDto): String = "${FIELDS[c.field] ?: c.field}: ${value(c, c.before)} → ${value(c, c.after)}"

    private fun value(c: HistoryChangeDto, v: JsonPrimitive?): String {
        if (v == null || v is JsonNull || v.content.isBlank()) return "—"
        return when (c.field) {
            "amount", "toAmount" -> v.longOrNull?.let { Money.format(it) + (c.currency?.let { cur -> " $cur" } ?: "") } ?: v.content
            "date" -> runCatching { Dates.label(Dates.localDate(v.content)) }.getOrDefault(v.content)
            "type" -> TYPES[v.content] ?: v.content
            else -> v.content
        }
    }

    /** De dónde salió una parte del valor: "6 400 MN · cambio del 01/10 a 600 (mercado 610)". */
    fun part(p: BreakdownPartDto): String {
        val lot = p.lot ?: return "${Money.format(p.qty, p.currency)} · sin bolsa: estimado a la tasa del día"
        val origin = when (lot.origin) { "EXCHANGE" -> "cambio"; "CARRY" -> "cambio entre monedas"; else -> "entrada" }
        val day = lot.day.take(10).split("-").let { if (it.size == 3) "${it[2]}/${it[1]}" else lot.day }
        return buildString {
            append("${Money.format(p.qty, p.currency)} · $origin del $day")
            if (lot.origin == "EXCHANGE") lot.rate?.let { append(" a ${num(it)}") }
            lot.marketRate?.let { append(" (mercado ${num(it)})") }
        }
    }

    /** Una tasa con hasta dos decimales: 600, 612,5. */
    fun num(v: Double): String = String.format(Locale.ROOT, "%.2f", v).trimEnd('0').trimEnd('.').replace('.', ',')
}
