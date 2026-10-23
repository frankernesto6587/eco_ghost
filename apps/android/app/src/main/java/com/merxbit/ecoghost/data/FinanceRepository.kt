package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.AccountDto
import com.merxbit.ecoghost.data.net.ApprovalCountsDto
import com.merxbit.ecoghost.data.net.ReportDto
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.LegDto
import com.merxbit.ecoghost.data.net.OverviewDto
import com.merxbit.ecoghost.data.net.TransactionDto
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/** `pendingDelta`: lo que moveria lo pendiente de aprobar (no esta en `balance`). */
data class Account(
    val id: String,
    val name: String,
    val type: String,
    val currency: String,
    val balance: Long,
    val pendingDelta: Long = 0,
    val pendingCount: Int = 0,
)

/** Un movimiento tal como se muestra: las transferencias y cambios van en una sola fila. */
data class Movement(
    val id: String,
    val date: LocalDate,
    val description: String,
    val type: String,
    val amount: Long,
    val currency: String,
    val accountName: String,
    val categoryName: String?,
    val categoryIcon: String?,
    val categoryColor: String?,
    val toAccountName: String? = null,
    val toAmount: Long? = null,
    val toCurrency: String? = null,
    val viaTelegram: Boolean = false,
    /** PENDING o REJECTED: se ve, pero no cuenta en los saldos. */
    val status: String = "APPROVED",
    /** A mercado del dia en la moneda de estadisticas, si esta activa (null: sin valorar). */
    val marketAmount: Long? = null,
    val valuationStatus: String? = null,
    /** Cuenta como gasto o ingreso (aprobado, sin deuda ni ajuste), como en el Panel. */
    val inTotals: Boolean = false,
)

data class Home(
    val baseCurrency: String,
    val totals: Map<String, Long>,
    val accounts: List<Account>,
    val monthIncome: Long,
    val monthExpense: Long,
    val receivable: Map<String, Long>,
    val payable: Map<String, Long>,
    val recent: List<Movement>,
    val pending: ApprovalCountsDto = ApprovalCountsDto(),
    val report: ReportDto? = null,
)

@Singleton
class FinanceRepository @Inject constructor(private val api: EcoApi) {
    private val _changes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** Se emite al guardar algo: las pantallas que muestran saldos o movimientos se recargan. */
    val changes: SharedFlow<Unit> = _changes

    fun notifyChanged() {
        _changes.tryEmit(Unit)
    }

    suspend fun home(baseCurrency: String): Home = coroutineScope {
        val overview = async { api.overview() }
        val accounts = async { api.accounts() }
        val txs = async { api.transactions(limit = 20).data }
        toHome(baseCurrency, overview.await(), accounts.await(), txs.await())
    }

    companion object {
        fun toHome(base: String, o: OverviewDto, accounts: List<AccountDto>, txs: List<TransactionDto>): Home {
            val balances = o.accountBalances.associateBy { it.id }
            val list = accounts.filter { it.isActive }.map {
                Account(it.id, it.name, it.type, it.currency, balances[it.id]?.balance ?: 0, it.pendingDelta, it.pendingCount)
            }
            // La moneda grande es la principal de la organización si tiene saldo; si no, la primera
            val main = if (o.totalBalance.containsKey(base) || o.totalBalance.isEmpty()) base else o.totalBalance.keys.first()
            return Home(
                baseCurrency = main,
                totals = o.totalBalance,
                accounts = list,
                monthIncome = o.monthIncome[main] ?: 0,
                monthExpense = o.monthExpense[main] ?: 0,
                receivable = o.pendingDebtsReceivable,
                payable = o.pendingDebtsPayable,
                recent = movements(txs).take(5),
                pending = o.pending,
                report = o.report,
            )
        }

        /**
         * La API devuelve las dos patas de una transferencia o cambio. La que
         * sale de la cuenta origen lleva linkedTransactionId hacia la que entra:
         * se muestra esa y se esconde la otra. Si solo vino la que entra (al
         * filtrar por la cuenta destino, o porque la otra está en la página
         * siguiente), la fila se arma desde ella, con el id de la que sale: así
         * no se duplica cuando llega la otra.
         */
        fun movements(txs: List<TransactionDto>): List<Movement> {
            val byId = txs.associateBy { it.id }
            val incomingLegs = txs.mapNotNull { it.linkedTransactionId }.toSet()
            return txs.mapNotNull { t ->
                when {
                    t.id in incomingLegs -> null
                    t.type !in PAIRED -> row(t, t.id, LegDto(t.id, t.amount, t.accountId, t.account), null)
                    t.linkedTransactionId != null -> {
                        val to = byId[t.linkedTransactionId]?.let { LegDto(it.id, it.amount, it.accountId, it.account) } ?: t.linkedTransaction
                        row(t, t.id, LegDto(t.id, t.amount, t.accountId, t.account), to)
                    }
                    t.linkedBy != null -> row(t, t.linkedBy.id, t.linkedBy, LegDto(t.id, t.amount, t.accountId, t.account))
                    // Una pierna huérfana (de datos viejos) no se muestra
                    else -> null
                }
            }
        }

        private fun row(t: TransactionDto, id: String, from: LegDto, to: LegDto?) = Movement(
            id = id,
            date = Dates.localDate(t.date),
            description = t.description,
            type = t.type,
            amount = from.amount,
            currency = from.account?.currency.orEmpty(),
            accountName = from.account?.name.orEmpty(),
            categoryName = t.category?.name,
            categoryIcon = t.category?.icon,
            categoryColor = t.category?.color,
            toAccountName = to?.account?.name,
            toAmount = to?.amount,
            toCurrency = to?.account?.currency,
            viaTelegram = t.source == "telegram",
            status = t.status,
            // De un par solo se muestra el valor de la pierna que sale
            marketAmount = t.marketAmount.takeIf { id == t.id },
            valuationStatus = t.valuationStatus.takeIf { id == t.id },
            inTotals = t.status == "APPROVED" && t.debtId == null && t.category?.isAdjustment != true &&
                (t.type == "INCOME" || t.type == "EXPENSE"),
        )

        private val PAIRED = setOf("TRANSFER", "EXCHANGE")
    }
}
