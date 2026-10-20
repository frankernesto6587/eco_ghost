package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.AccountDto
import com.merxbit.ecoghost.data.net.ApprovalCountsDto
import com.merxbit.ecoghost.data.net.ReportDto
import com.merxbit.ecoghost.data.net.EcoApi
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
    /** Valor en la moneda de estadisticas, si esta activa (null: sin valorar). */
    val reportAmount: Long? = null,
    val valuationStatus: String? = null,
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
         * se muestra esa y se esconde la otra.
         */
        fun movements(txs: List<TransactionDto>): List<Movement> {
            val byId = txs.associateBy { it.id }
            val incomingLegs = txs.mapNotNull { it.linkedTransactionId }.toSet()
            return txs
                .filterNot { it.id in incomingLegs }
                .filterNot { it.type in PAIRED && it.linkedTransactionId == null }
                .map { t ->
                    val to = t.linkedTransactionId?.let(byId::get)
                    Movement(
                        id = t.id,
                        date = Dates.localDate(t.date),
                        description = t.description,
                        type = t.type,
                        amount = t.amount,
                        currency = t.account?.currency.orEmpty(),
                        accountName = t.account?.name.orEmpty(),
                        categoryName = t.category?.name,
                        categoryIcon = t.category?.icon,
                        categoryColor = t.category?.color,
                        toAccountName = to?.account?.name,
                        toAmount = to?.amount,
                        toCurrency = to?.account?.currency,
                        viaTelegram = t.source == "telegram",
                        status = t.status,
                        reportAmount = t.reportAmount,
                        valuationStatus = t.valuationStatus,
                    )
                }
        }

        private val PAIRED = setOf("TRANSFER", "EXCHANGE")
    }
}
