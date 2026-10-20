package com.merxbit.ecoghost.ui.movements

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.data.Dates
import com.merxbit.ecoghost.data.FinanceRepository
import com.merxbit.ecoghost.data.Movement
import com.merxbit.ecoghost.data.errorMessage
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.TransactionDto
import com.merxbit.ecoghost.ui.common.MovementRow
import com.merxbit.ecoghost.ui.theme.Eco
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MovementsViewModel @Inject constructor(private val api: EcoApi, repo: FinanceRepository) : ViewModel() {
    private val raw = mutableListOf<TransactionDto>()
    var items by mutableStateOf<List<Movement>>(emptyList()); private set
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    private var page = 0
    private var end = false
    private var org: String? = null
    /** Moneda de estadisticas, si la organizacion valora (para el "≈ USD" de cada fila). */
    var reportCurrency by mutableStateOf<String?>(null); private set

    init {
        viewModelScope.launch { repo.changes.collect { if (org != null) refresh() } }
    }

    fun open(orgId: String) {
        if (org == orgId) return
        org = orgId
        refresh()
        viewModelScope.launch {
            reportCurrency = runCatching { api.valuationStatus() }.getOrNull()?.takeIf { it.enabled }?.reportCurrency
        }
    }

    fun refresh() {
        raw.clear(); page = 0; end = false; items = emptyList()
        more()
    }

    fun more() {
        if (loading || end) return
        loading = true
        viewModelScope.launch {
            runCatching { api.transactions(limit = PAGE, page = page + 1).data }
                .onSuccess {
                    page++
                    end = it.size < PAGE
                    raw += it
                    // Se recalcula sobre todo lo cargado para emparejar transferencias entre páginas
                    items = FinanceRepository.movements(raw)
                    error = null
                }
                .onFailure { error = errorMessage(it) }
            loading = false
        }
    }

    private companion object { const val PAGE = 40 }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovementsScreen(orgId: String, vm: MovementsViewModel = hiltViewModel()) {
    LaunchedEffect(orgId) { vm.open(orgId) }
    val c = Eco.colors
    val state = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 >= state.layoutInfo.totalItemsCount - 5 } }
    LaunchedEffect(nearEnd) { if (nearEnd) vm.more() }

    val groups = vm.items.groupBy { it.date }

    PullToRefreshBox(vm.loading && vm.items.isNotEmpty(), vm::refresh, Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), state = state) {
            item { Text("Movimientos", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)) }
            vm.error?.let { msg ->
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(msg, color = c.muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        TextButton(vm::more) { Text("Reintentar", color = c.accent) }
                    }
                }
            }
            groups.forEach { (day, list) ->
                item(key = "d$day") {
                    Text(
                        Dates.label(day).uppercase(), style = MaterialTheme.typography.labelSmall, color = c.muted,
                        modifier = Modifier.padding(top = 18.dp, bottom = 2.dp),
                    )
                }
                items(list, key = { it.id }) { m ->
                    MovementRow(m, reportCurrency = vm.reportCurrency)
                    HorizontalDivider(color = c.line)
                }
            }
            if (vm.loading) item {
                Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
            }
            if (!vm.loading && vm.items.isEmpty() && vm.error == null) item {
                Text("Nada por aquí todavía.", color = c.muted, modifier = Modifier.padding(top = 24.dp))
            }
        }
    }
}
