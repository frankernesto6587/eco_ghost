package com.merxbit.ecoghost.data

import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Importes en centavos (Long, nunca Double). Igual que el prototipo:
 * miles con espacio fino, centavos solo cuando existen, signo menos tipográfico.
 */
object Money {
    private const val THIN = ' '

    fun format(cents: Long): String {
        val neg = cents < 0
        val abs = kotlin.math.abs(cents)
        val int = (abs / 100).toString().reversed().chunked(3).joinToString(THIN.toString()).reversed()
        val dec = abs % 100
        val s = if (dec != 0L) "$int,${dec.toString().padStart(2, '0')}" else int
        return if (neg) "−$s" else s
    }

    fun format(cents: Long, currency: String) = "${format(cents)} $currency"
}

object Dates {
    private val MESES = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
    private val DIAS = listOf("lun", "mar", "mié", "jue", "vie", "sáb", "dom")
    val MESES_LARGOS = listOf(
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    )

    fun localDate(iso: String): LocalDate =
        java.time.Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate()

    /** Día y hora de algo que pasó: "Hoy · 14:05", "Mar 21 oct · 09:30". */
    fun stamp(iso: String, today: LocalDate = LocalDate.now()): String {
        val t = java.time.Instant.parse(iso).atZone(ZoneId.systemDefault())
        return "${label(t.toLocalDate(), today)} · %02d:%02d".format(t.hour, t.minute)
    }

    /** "Hoy", "Ayer", "Vie 14 oct" (y el año si no es el actual). */
    fun label(d: LocalDate, today: LocalDate = LocalDate.now()): String {
        val diff = ChronoUnit.DAYS.between(d, today)
        if (diff == 0L) return "Hoy"
        if (diff == 1L) return "Ayer"
        val s = "${DIAS[d.dayOfWeek.value - 1]} ${d.dayOfMonth} ${MESES[d.monthValue - 1]}"
        val cap = s.replaceFirstChar { it.uppercase() }
        return if (d.year != today.year) "$cap ${d.year}" else cap
    }
}
