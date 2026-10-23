package com.merxbit.ecoghost.ui.movements

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.data.CategoryGroup
import com.merxbit.ecoghost.data.Dates
import com.merxbit.ecoghost.data.FinanceRepository
import com.merxbit.ecoghost.data.Movement
import com.merxbit.ecoghost.data.MovementFilter
import com.merxbit.ecoghost.data.MovementFilters
import com.merxbit.ecoghost.data.errorMessage
import com.merxbit.ecoghost.data.net.AccountDto
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.SummaryDto
import com.merxbit.ecoghost.data.net.TransactionDto
import com.merxbit.ecoghost.ui.common.MovementRow
import com.merxbit.ecoghost.ui.theme.Eco
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MovementsViewModel @Inject constructor(private val api: EcoApi, repo: FinanceRepository) : ViewModel() {
    private val raw = mutableListOf<TransactionDto>()
    var items by mutableStateOf<List<Movement>>(emptyList()); private set
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    /** No quedan más páginas (el total del último día ya está completo). */
    var end by mutableStateOf(false); private set
    var filter by mutableStateOf(MovementFilter()); private set
    /** Lo que suma lo filtrado; null sin filtros. */
    var summary by mutableStateOf<SummaryDto?>(null); private set
    var accounts by mutableStateOf<List<AccountDto>>(emptyList()); private set
    var groups by mutableStateOf<List<CategoryGroup>>(emptyList()); private set
    private var page = 0
    private var org: String? = null
    /** Sube con cada recarga: lo que llegue de una búsqueda anterior se descarta. */
    private var gen = 0
    private var typing: Job? = null
    /** Moneda de estadisticas, si la organizacion valora (para el "≈ USD" de cada fila). */
    var reportCurrency by mutableStateOf<String?>(null); private set

    init {
        viewModelScope.launch { repo.changes.collect { if (org != null) refresh() } }
    }

    fun open(orgId: String) {
        if (org == orgId) return
        org = orgId
        filter = MovementFilter()
        refresh()
        viewModelScope.launch {
            reportCurrency = runCatching { api.valuationStatus() }.getOrNull()?.takeIf { it.enabled }?.reportCurrency
        }
        // Para los selectores: las cuentas cerradas también (tienen movimientos viejos), al final
        viewModelScope.launch { accounts = runCatching { api.accounts() }.getOrDefault(emptyList()).sortedBy { !it.isActive } }
        viewModelScope.launch { groups = runCatching { MovementFilters.groups(api.categories()) }.getOrDefault(emptyList()) }
    }

    /** Al escribir en el buscador se espera a que pare; los chips recargan enseguida. */
    fun applyFilter(f: MovementFilter) {
        val onlySearch = f.copy(search = "") == filter.copy(search = "")
        filter = f
        typing?.cancel()
        if (onlySearch) typing = viewModelScope.launch { delay(350); refresh() } else refresh()
    }

    fun refresh() {
        gen++
        raw.clear(); page = 0; end = false; items = emptyList(); loading = false; error = null
        loadSummary()
        more()
    }

    private fun loadSummary() {
        if (!filter.isActive) { summary = null; return }
        val g = gen
        val q = MovementFilters.query(filter, groups)
        viewModelScope.launch {
            val s = runCatching { api.summary(q.from, q.to, q.type, q.accountId, q.categoryId, q.status, q.search) }.getOrNull()
            if (g == gen) summary = s
        }
    }

    fun more() {
        if (loading || end) return
        loading = true
        val g = gen
        val q = MovementFilters.query(filter, groups)
        viewModelScope.launch {
            val r = runCatching {
                api.transactions(
                    limit = PAGE, page = page + 1,
                    from = q.from, to = q.to, type = q.type, accountId = q.accountId,
                    categoryId = q.categoryId, status = q.status, search = q.search,
                ).data
            }
            if (g != gen) return@launch
            r.onSuccess {
                page++
                end = it.size < PAGE
                raw += it
                // Se recalcula sobre todo lo cargado para emparejar transferencias entre páginas
                items = FinanceRepository.movements(raw)
                error = null
            }.onFailure { error = errorMessage(it) }
            loading = false
        }
    }

    private companion object { const val PAGE = 40 }
}

@Composable
fun MovementsScreen(orgId: String, showStatus: Boolean, onOpen: (String) -> Unit, vm: MovementsViewModel = hiltViewModel()) {
    LaunchedEffect(orgId) { vm.open(orgId) }
    MovementsContent(
        vm.items, vm.filter, vm.summary, vm.loading, vm.end, vm.error, vm.reportCurrency,
        vm.accounts, vm.groups, showStatus,
        onFilter = vm::applyFilter, onOpen = onOpen, onMore = vm::more, onRefresh = vm::refresh,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovementsContent(
    items: List<Movement>,
    filter: MovementFilter,
    summary: SummaryDto?,
    loading: Boolean,
    end: Boolean,
    error: String?,
    reportCurrency: String?,
    accounts: List<AccountDto>,
    groups: List<CategoryGroup>,
    showStatus: Boolean,
    onFilter: (MovementFilter) -> Unit,
    onOpen: (String) -> Unit,
    onMore: () -> Unit,
    onRefresh: () -> Unit,
) {
    val c = Eco.colors
    var searching by rememberSaveable { mutableStateOf(filter.search.isNotEmpty()) }
    val state = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 >= state.layoutInfo.totalItemsCount - 5 } }
    LaunchedEffect(nearEnd) { if (nearEnd) onMore() }
    // Con otro filtro, la lista vuelve arriba
    LaunchedEffect(filter) { state.scrollToItem(0) }

    val groupsByDay = items.groupBy { it.date }
    val lastDay = groupsByDay.keys.lastOrNull()

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Movimientos", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                if (!searching) IconButton({ searching = true }) { Icon(Icons.Outlined.Search, "Buscar", tint = c.text) }
            }
            if (searching) {
                SearchField(
                    filter.search, { onFilter(filter.copy(search = it)) },
                    onClose = { searching = false; if (filter.search.isNotEmpty()) onFilter(filter.copy(search = "")) },
                )
                Spacer(Modifier.padding(top = 8.dp))
            }
            FilterChips(filter, accounts, groups, showStatus, onFilter)
        }

        PullToRefreshBox(loading && items.isNotEmpty(), onRefresh, Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), state = state) {
                // Sin resultados ya lo dice "Nada con estos filtros"
                if (filter.isActive && summary != null && summary.count > 0) item(key = "summary") {
                    SummaryCard(summary, filter.status) { searching = false; onFilter(MovementFilter()) }
                }
                error?.let { msg ->
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(msg, color = c.muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                            TextButton(onMore) { Text("Reintentar", color = c.accent) }
                        }
                    }
                }
                groupsByDay.forEach { (day, list) ->
                    item(key = "d$day") {
                        Row(Modifier.padding(top = 18.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(Dates.label(day).uppercase(), style = MaterialTheme.typography.labelSmall, color = c.muted, modifier = Modifier.weight(1f))
                            // El último día cargado puede seguir en la página siguiente: su total aún no está completo
                            val total = if (day == lastDay && !end) "" else MovementFilters.dayTotals(list)
                            if (total.isNotEmpty()) {
                                Spacer(Modifier.width(8.dp))
                                Text(total, style = MaterialTheme.typography.labelSmall, color = c.muted)
                            }
                        }
                    }
                    items(list, key = { it.id }) { m ->
                        MovementRow(m, Modifier.clickable { onOpen(m.id) }, reportCurrency = reportCurrency)
                        HorizontalDivider(color = c.line)
                    }
                }
                if (loading) item {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
                }
                if (!loading && items.isEmpty() && error == null) item {
                    if (filter.isActive) {
                        Column(Modifier.padding(top = 24.dp)) {
                            Text("Nada con estos filtros.", color = c.muted)
                            TextButton({ searching = false; onFilter(MovementFilter()) }) { Text("Quitar filtros", color = c.accent) }
                        }
                    } else {
                        Text("Nada por aquí todavía.", color = c.muted, modifier = Modifier.padding(top = 24.dp))
                    }
                }
            }
        }
    }
}
