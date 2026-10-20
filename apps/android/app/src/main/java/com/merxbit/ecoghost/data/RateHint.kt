package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.RateSuggestionDto
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Lo que se enseña bajo "Recibes" en un cambio: la tasa de elTOQUE de ese día
 * (o la última anterior), cómo queda la del cambio frente a ella y cuánto se
 * recibiría a esa tasa (para "Usar").
 */
data class RateHint(val market: String, val mine: String?, val suggested: Long?)

object RateHints {
    /** Las tasas van en MN por unidad; el MN vale 1. Importes en centavos. */
    fun exchange(from: String, to: String, s: RateSuggestionDto?, amount: Long, toAmount: Long, day: LocalDate): RateHint? {
        if (s == null || from == to) return null
        val a = if (from == "MN") null else s.rates[from] ?: return null
        val b = if (to == "MN") null else s.rates[to] ?: return null
        val per = (a?.value ?: 1.0) / (b?.value ?: 1.0) // unidades de `to` por 1 de `from`

        // "1 <la que más vale> = N <la otra>", sea cual sea el sentido del cambio
        fun quote(k: Double) =
            if (k >= 1) "1 $from = ${Money.format((k * 100).roundToLong())} $to"
            else "1 $to = ${Money.format((100 / k).roundToLong())} $from"

        val used = listOfNotNull(a, b)
        val rateDay = used.minOf { it.day }
        val manual = used.any { it.source == "MANUAL" }
        val d = LocalDate.parse(rateDay)
        val date = "%02d/%02d".format(d.dayOfMonth, d.monthValue)
        val source = (if (manual) "Tasa del $date" else "elTOQUE $date") +
            (if (d.isBefore(day)) " (la última)" else "") + (if (manual) ", puesta a mano" else "")

        val mine = if (amount > 0 && toAmount > 0) {
            val diff = toAmount / (amount * per) - 1
            val how = if (abs(diff) < 0.0005) "igual" else {
                val pct = (abs(diff) * 1000).roundToLong()
                "${pct / 10},${pct % 10} % ${if (diff > 0) "más" else "menos"}"
            }
            "el tuyo: ${quote(toAmount.toDouble() / amount)} · $how"
        } else null
        val suggested = if (amount > 0) (amount * per).roundToLong().takeIf { it > 0 && it != toAmount } else null
        return RateHint("$source: ${quote(per)}", mine, suggested)
    }
}
