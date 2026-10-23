package com.merxbit.ecoghost.ui.movements

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.merxbit.ecoghost.data.CategoryGroup
import com.merxbit.ecoghost.data.MovementFilter
import com.merxbit.ecoghost.data.MovementFilters
import com.merxbit.ecoghost.data.Period
import com.merxbit.ecoghost.data.StatusFilter
import com.merxbit.ecoghost.data.TypeFilter
import com.merxbit.ecoghost.data.net.AccountDto
import com.merxbit.ecoghost.data.net.SummaryDto
import com.merxbit.ecoghost.ui.common.EcoCard
import com.merxbit.ecoghost.ui.common.accountIcon
import com.merxbit.ecoghost.ui.common.categoryIcon
import com.merxbit.ecoghost.ui.common.parseColor
import com.merxbit.ecoghost.ui.entry.EcoChip
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import java.time.Instant
import java.time.ZoneOffset

/** Qué selector está abierto. */
private enum class Pick { ACCOUNT, CATEGORY, PERIOD, RANGE, STATUS }

/** El buscador: busca en todo el historial (descripción, nota, categoría, cuenta o importe). */
@Composable
fun SearchField(value: String, onChange: (String) -> Unit, onClose: () -> Unit, autoFocus: Boolean = true) {
    val c = Eco.colors
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) { if (autoFocus) runCatching { focus.requestFocus() } }
    OutlinedTextField(
        value, onChange,
        Modifier.fillMaxWidth().focusRequester(focus),
        placeholder = { Text("Buscar: texto o importe", color = c.muted) },
        leadingIcon = { Icon(Icons.Outlined.Search, null, tint = c.muted) },
        trailingIcon = { IconButton(onClose) { Icon(Icons.Outlined.Close, "Cerrar búsqueda", tint = c.muted) } },
        singleLine = true,
        shape = EcoShape.field,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
        colors = OutlinedTextFieldDefaults.colors(
            unfocusedBorderColor = c.line, focusedBorderColor = c.accent,
            unfocusedContainerColor = c.surface, focusedContainerColor = c.surface,
        ),
    )
}

/** Los chips de tipo y, debajo, los selectores de cuenta, categoría, fecha y estado. */
@Composable
fun FilterChips(
    filter: MovementFilter,
    accounts: List<AccountDto>,
    groups: List<CategoryGroup>,
    showStatus: Boolean,
    onFilter: (MovementFilter) -> Unit,
) {
    var pick by remember { mutableStateOf<Pick?>(null) }
    val down = Icons.Outlined.ArrowDropDown
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Sin chip "Todos": tocar el elegido otra vez lo quita. Así caben los cuatro en un teléfono estrecho.
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TypeFilter.entries.filter { it != TypeFilter.ALL }.forEach { t ->
                val next = if (filter.type == t) TypeFilter.ALL else t
                // Al cambiar de tipo, una categoría que ya no le vale se quita
                EcoChip(t.label, filter.type == t) { onFilter(filter.copy(type = next, categoryId = filter.categoryId.takeIf { fits(it, next, groups) })) }
            }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val account = accounts.firstOrNull { it.id == filter.accountId }
            EcoChip(account?.name ?: "Cuenta", account != null, trailing = down) { pick = Pick.ACCOUNT }
            val category = filter.categoryId?.let { id -> groups.flatMap { listOf(it.root) + it.children }.firstOrNull { it.id == id } }
            EcoChip(category?.name ?: "Categoría", category != null, trailing = down) { pick = Pick.CATEGORY }
            val period = filter.period != Period.All
            EcoChip(if (period) MovementFilters.periodLabel(filter.period) else "Fecha", period, trailing = down) { pick = Pick.PERIOD }
            if (showStatus) {
                EcoChip(filter.status.chip, filter.status != StatusFilter.DEFAULT, trailing = down) { pick = Pick.STATUS }
            }
        }
    }

    val close = { pick = null }
    when (pick) {
        Pick.ACCOUNT -> PickerSheet("Cuenta", close) {
            PickRow("Todas las cuentas", filter.accountId == null) { onFilter(filter.copy(accountId = null)); close() }
            accounts.forEach { a ->
                PickRow(
                    "${a.name} · ${a.currency}", filter.accountId == a.id, accountIcon(a.type),
                    sub = if (a.isActive) null else "Cerrada",
                ) { onFilter(filter.copy(accountId = a.id)); close() }
            }
        }
        Pick.CATEGORY -> CategoryFilterSheet(groups, filter, close) { onFilter(filter.copy(categoryId = it)); close() }
        Pick.PERIOD -> PickerSheet("Fecha", close) {
            PickRow("Todo", filter.period == Period.All) { onFilter(filter.copy(period = Period.All)); close() }
            MovementFilters.recentMonths().forEach { m ->
                val p = Period.Month(m)
                PickRow(MovementFilters.periodLabel(p), filter.period == p) { onFilter(filter.copy(period = p)); close() }
            }
            val range = filter.period as? Period.Range
            PickRow(range?.let { MovementFilters.periodLabel(it) } ?: "Elegir fechas…", range != null, Icons.Outlined.DateRange) { pick = Pick.RANGE }
        }
        Pick.RANGE -> RangeDialog(filter.period as? Period.Range, close) { onFilter(filter.copy(period = it)); close() }
        Pick.STATUS -> PickerSheet("Estado", close) {
            StatusFilter.entries.forEach { s ->
                PickRow(s.label, filter.status == s) { onFilter(filter.copy(status = s)); close() }
            }
        }
        null -> {}
    }
}

/** Con Gastos o Ingresos solo valen sus categorías; transferencias y cambios no llevan ninguna. */
private fun fits(categoryId: String?, type: TypeFilter, groups: List<CategoryGroup>): Boolean {
    if (categoryId == null) return false
    return when (val api = type.api) {
        null -> true
        "EXPENSE", "INCOME" -> groups.firstOrNull { g -> g.root.id == categoryId || g.children.any { it.id == categoryId } }?.fits(api) ?: true
        else -> false
    }
}

/** Lo que suman los movimientos que salen, arriba de la lista, con el botón para quitar los filtros. */
@Composable
fun SummaryCard(summary: SummaryDto, status: StatusFilter, onClear: () -> Unit) {
    val c = Eco.colors
    val lines = MovementFilters.summaryLines(summary, status)
    EcoCard(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                lines.forEachIndexed { i, line ->
                    if (i == 0) Text(line, style = MaterialTheme.typography.titleSmall)
                    else Text(line, style = MaterialTheme.typography.bodyMedium, color = c.muted)
                }
            }
            Text(
                "Quitar filtros", style = MaterialTheme.typography.labelLarge, color = c.accent,
                modifier = Modifier.clickable(onClick = onClear).padding(start = 12.dp, bottom = 4.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PickerSheet(title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val c = Eco.colors
    ModalBottomSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.surface, shape = EcoShape.sheet) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 8.dp))
            content()
        }
    }
}

@Composable
private fun PickRow(
    label: String,
    selected: Boolean,
    icon: ImageVector? = null,
    iconColor: Color? = null,
    sub: String? = null,
    onClick: () -> Unit,
) {
    val c = Eco.colors
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon?.let {
            Icon(it, null, tint = iconColor ?: c.muted, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge, color = if (selected) c.accent else c.text)
            sub?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.muted) }
        }
        if (selected) Icon(Icons.Outlined.Check, null, tint = c.accent, modifier = Modifier.size(20.dp))
    }
}

/** Un grupo se elige entero (con sus hijas) o una hija sola. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryFilterSheet(groups: List<CategoryGroup>, filter: MovementFilter, onDismiss: () -> Unit, onPick: (String?) -> Unit) {
    val c = Eco.colors
    val shown = filter.type.api?.takeIf { it == "EXPENSE" || it == "INCOME" }?.let { t -> groups.filter { it.fits(t) } } ?: groups
    PickerSheet("Categoría", onDismiss) {
        PickRow("Todas las categorías", filter.categoryId == null) { onPick(null) }
        shown.forEach { g ->
            PickRow(
                g.root.name, filter.categoryId == g.root.id, categoryIcon(g.root.icon), parseColor(g.root.color),
                sub = if (g.children.isEmpty()) null else "Con todas sus subcategorías",
            ) { onPick(g.root.id) }
            if (g.children.isNotEmpty()) {
                FlowRow(
                    Modifier.padding(start = 32.dp, bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    g.children.forEach { ch -> EcoChip(ch.name, filter.categoryId == ch.id) { onPick(ch.id) } }
                }
            }
        }
        if (shown.isEmpty()) Text("No hay categorías para este tipo.", color = c.muted, modifier = Modifier.padding(vertical = 12.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RangeDialog(current: Period.Range?, onDismiss: () -> Unit, onPick: (Period.Range) -> Unit) {
    val c = Eco.colors
    // El selector trabaja en milisegundos UTC
    val millis = { d: java.time.LocalDate -> d.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }
    val day = { m: Long -> Instant.ofEpochMilli(m).atZone(ZoneOffset.UTC).toLocalDate() }
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = current?.from?.let(millis),
        initialSelectedEndDateMillis = current?.to?.let(millis),
    )
    DatePickerDialog(
        onDismiss,
        confirmButton = {
            TextButton(
                {
                    val from = state.selectedStartDateMillis?.let(day)
                    // Con un solo día elegido, desde ese día hasta ese mismo día
                    if (from != null) onPick(Period.Range(from, state.selectedEndDateMillis?.let(day) ?: from)) else onDismiss()
                },
            ) { Text("Aceptar", color = c.accent) }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancelar", color = c.muted) } },
    ) {
        DateRangePicker(
            state, Modifier.weight(1f), showModeToggle = false,
            title = { Text("Desde y hasta", modifier = Modifier.padding(start = 24.dp, top = 16.dp)) },
        )
    }
}
