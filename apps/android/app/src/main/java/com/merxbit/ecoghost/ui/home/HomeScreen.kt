package com.merxbit.ecoghost.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.data.Dates
import com.merxbit.ecoghost.data.FinanceRepository
import com.merxbit.ecoghost.data.Home
import com.merxbit.ecoghost.data.Money
import com.merxbit.ecoghost.data.errorMessage
import com.merxbit.ecoghost.data.net.OrgDto
import com.merxbit.ecoghost.ui.common.AmountText
import com.merxbit.ecoghost.ui.common.Avatar
import com.merxbit.ecoghost.ui.common.EcoCard
import com.merxbit.ecoghost.ui.common.MovementRow
import com.merxbit.ecoghost.ui.common.SectionTitle
import com.merxbit.ecoghost.ui.common.accountIcon
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(private val repo: FinanceRepository) : ViewModel() {
    var home by mutableStateOf<Home?>(null); private set
    var error by mutableStateOf<String?>(null); private set
    var refreshing by mutableStateOf(false); private set
    private var loadedFor: OrgDto? = null

    init {
        viewModelScope.launch { repo.changes.collect { loadedFor?.let { load(it, force = true) } } }
    }

    fun load(org: OrgDto, force: Boolean = false) {
        if (!force && loadedFor?.id == org.id && home != null) return
        if (loadedFor?.id != org.id) home = null
        loadedFor = org
        refreshing = true
        viewModelScope.launch {
            runCatching { repo.home(org.baseCurrency) }
                .onSuccess { home = it; error = null }
                .onFailure { error = errorMessage(it) }
            refreshing = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    org: OrgDto,
    userName: String,
    onOrgClick: () -> Unit,
    onAvatarClick: () -> Unit,
    onSeeAll: () -> Unit,
    vm: HomeViewModel = hiltViewModel(),
) {
    LaunchedEffect(org.id) { vm.load(org) }
    HomeContent(org, userName, vm.home, vm.error, vm.refreshing, { vm.load(org, force = true) }, onOrgClick, onAvatarClick, onSeeAll)
}

/** Solo pinta el estado (sin ViewModel): se usa también en las capturas de los tests. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeContent(
    org: OrgDto,
    userName: String,
    home: Home?,
    error: String?,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onOrgClick: () -> Unit = {},
    onAvatarClick: () -> Unit = {},
    onSeeAll: () -> Unit = {},
) {
    val c = Eco.colors
    PullToRefreshBox(refreshing && home != null, onRefresh, Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            // Barra: organización + avatar
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.clip(EcoShape.card).clickable(onClick = onOrgClick).padding(vertical = 8.dp, horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Storefront, null, tint = c.accent, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(org.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 220.dp))
                    Icon(Icons.Outlined.ExpandMore, "Cambiar organización", tint = c.muted)
                }
                Spacer(Modifier.weight(1f))
                Box(Modifier.clip(androidx.compose.foundation.shape.CircleShape).clickable(onClick = onAvatarClick)) { Avatar(userName) }
            }

            error?.let { msg ->
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp).background(c.surface2, EcoShape.card).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.CloudOff, null, tint = c.muted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(msg, style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.weight(1f))
                    TextButton(onRefresh) { Text("Reintentar", color = c.accent) }
                }
            }

            if (home == null) {
                if (error == null) Box(Modifier.fillMaxWidth().height(300.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = c.accent)
                }
                return@Column
            }

            Hero(home)
            Accounts(home)
            Month(home)
            Debts(home)

            SectionTitle("Últimos movimientos") {
                TextButton(onSeeAll) { Text("Ver todos", color = c.accent, style = MaterialTheme.typography.labelMedium) }
            }
            if (home.recent.isEmpty()) {
                Text("Todavía no hay movimientos.", color = c.muted, style = MaterialTheme.typography.bodyMedium)
            }
            home.recent.forEachIndexed { i, m ->
                if (i > 0) HorizontalDivider(color = c.line)
                MovementRow(m)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Hero(home: Home) {
    val c = Eco.colors
    Column(Modifier.padding(top = 18.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Saldo total", style = MaterialTheme.typography.labelMedium, color = c.muted)
        AmountText(
            home.totals[home.baseCurrency] ?: 0, home.baseCurrency,
            color = c.hero, style = MaterialTheme.typography.displayLarge,
        )
        val others = home.totals.filterKeys { it != home.baseCurrency }
        if (others.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                others.forEach { (cur, v) ->
                    AmountText(
                        v, cur, style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.background(c.surface2, EcoShape.field).padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Accounts(home: Home) {
    val c = Eco.colors
    Row(
        Modifier.padding(top = 12.dp).horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        home.accounts.forEach { a ->
            Column(
                Modifier.width(150.dp).background(c.surface, EcoShape.card).border(1.dp, c.line, EcoShape.card).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(accountIcon(a.type), null, tint = c.muted, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(a.name, style = MaterialTheme.typography.bodySmall, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                AmountText(a.balance, a.currency, color = if (a.balance < 0) c.danger else c.text)
            }
        }
    }
}

@Composable
private fun Month(home: Home) {
    val c = Eco.colors
    val today = LocalDate.now()
    val max = maxOf(home.monthIncome, home.monthExpense, 1)
    EcoCard(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row {
                Text(Dates.MESES_LARGOS[today.monthValue - 1], style = MaterialTheme.typography.titleSmall)
                Text("  ${today.dayOfMonth} días · ${home.baseCurrency}", style = MaterialTheme.typography.bodySmall, color = c.muted)
            }
            Bar("Ingresos", home.monthIncome, max, c.income)
            Bar("Gastos", home.monthExpense, max, c.warning)
        }
    }
}

@Composable
private fun Bar(label: String, value: Long, max: Long, color: androidx.compose.ui.graphics.Color) {
    val c = Eco.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.width(64.dp))
        Box(Modifier.weight(1f).height(8.dp).background(c.surface2, androidx.compose.foundation.shape.RoundedCornerShape(2.dp))) {
            Box(
                Modifier.fillMaxHeight().fillMaxWidth((value.toFloat() / max).coerceIn(0f, 1f))
                    .background(color, androidx.compose.foundation.shape.RoundedCornerShape(2.dp)),
            )
        }
        Text(Money.format(value), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 10.dp).widthIn(min = 72.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
private fun Debts(home: Home) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DebtCard("Te deben", home.receivable, Modifier.weight(1f))
        DebtCard("Debes", home.payable, Modifier.weight(1f))
    }
}

@Composable
private fun DebtCard(label: String, amounts: Map<String, Long>, modifier: Modifier) {
    val c = Eco.colors
    EcoCard(modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = c.muted)
            if (amounts.isEmpty()) Text("0", style = MaterialTheme.typography.titleMedium)
            amounts.forEach { (cur, v) -> AmountText(v, cur, style = MaterialTheme.typography.titleMedium) }
        }
    }
}
