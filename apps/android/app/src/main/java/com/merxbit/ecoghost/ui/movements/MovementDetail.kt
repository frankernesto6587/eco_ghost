package com.merxbit.ecoghost.ui.movements

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.data.Dates
import com.merxbit.ecoghost.data.HistoryText
import com.merxbit.ecoghost.data.MovementDetail
import com.merxbit.ecoghost.data.MovementsRepository
import com.merxbit.ecoghost.data.errorMessage
import com.merxbit.ecoghost.data.net.BreakdownDto
import com.merxbit.ecoghost.data.net.HistoryEntryDto
import com.merxbit.ecoghost.ui.common.AmountText
import com.merxbit.ecoghost.ui.entry.EntrySheet
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MovementDetailViewModel @Inject constructor(private val repo: MovementsRepository) : ViewModel() {
    var detail by mutableStateOf<MovementDetail?>(null); private set
    var error by mutableStateOf<String?>(null); private set
    var busy by mutableStateOf(false); private set
    private var id: String? = null

    fun open(movementId: String) {
        id = movementId; detail = null; error = null
        reload()
    }

    fun reload() {
        val current = id ?: return
        viewModelScope.launch {
            runCatching { repo.detail(current) }
                .onSuccess { if (id == current) { detail = it; error = null } }
                .onFailure { error = errorMessage(it) }
        }
    }

    fun delete(reason: String, onDone: (String) -> Unit) {
        val d = detail ?: return
        busy = true
        viewModelScope.launch {
            runCatching { repo.delete(d.tx.id, reason) }
                .onSuccess { onDone("Borrado · ${d.tx.description}") }
                .onFailure { error = errorMessage(it) }
            busy = false
        }
    }
}

/** Al tocar un movimiento: todo lo que hay que saber de él y, a quien puede, editar o borrar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovementDetailSheet(
    id: String,
    orgId: String,
    canEdit: Boolean,
    onDismiss: () -> Unit,
    onMessage: (String) -> Unit,
    vm: MovementDetailViewModel = hiltViewModel(),
) {
    LaunchedEffect(id) { vm.open(id) }
    var editing by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val c = Eco.colors

    ModalBottomSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.surface, shape = EcoShape.sheet) {
        val d = vm.detail
        when {
            d != null -> MovementDetailContent(
                d, canEdit = canEdit && MovementsRepository.lock(d.tx) != null, busy = vm.busy, error = vm.error,
                onClose = onDismiss, onEdit = { editing = true }, onDelete = { deleting = true },
            )
            vm.error != null -> Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(vm.error!!, color = c.muted)
                TextButton(vm::reload) { Text("Reintentar", color = c.accent) }
            }
            else -> Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
        }
    }

    val tx = vm.detail?.tx
    if (editing && tx != null) {
        EntrySheet(orgId, onDismiss = { editing = false }, onSaved = { msg -> onMessage(msg); vm.reload() }, editing = tx)
    }
    if (deleting && tx != null) {
        DeleteDialog(tx.description, pair = MovementsRepository.legs(tx) != null, onDismiss = { deleting = false }) { reason ->
            deleting = false
            vm.delete(reason) { msg -> onMessage(msg); onDismiss() }
        }
    }
}

/** Solo pinta (sin ViewModel), para las capturas de los tests. */
@Composable
fun MovementDetailContent(
    detail: MovementDetail,
    canEdit: Boolean,
    busy: Boolean,
    error: String?,
    onClose: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val c = Eco.colors
    val tx = detail.tx
    val legs = MovementsRepository.legs(tx)
    // En un par se muestra desde la pierna que sale
    val from = legs?.first?.account ?: tx.account
    val to = legs?.second
    val amount = legs?.first?.amount ?: tx.amount

    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp)) {
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Tag(HistoryText.TYPES[tx.type] ?: tx.type, c.muted)
                when (tx.status) {
                    "PENDING" -> { Spacer(Modifier.width(6.dp)); Tag("Por aprobar", c.warning) }
                    "REJECTED" -> { Spacer(Modifier.width(6.dp)); Tag("Rechazado", c.danger) }
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClose) { Icon(Icons.Outlined.Close, "Cerrar", tint = c.muted) }
            }

            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                when (tx.type) {
                    "INCOME" -> AmountText(amount, from?.currency, prefix = "+", color = c.income, style = MaterialTheme.typography.displayLarge)
                    "EXPENSE" -> AmountText(amount, from?.currency, prefix = "−", style = MaterialTheme.typography.displayLarge)
                    else -> AmountText(amount, from?.currency, style = MaterialTheme.typography.displayLarge)
                }
                if (tx.type == "EXCHANGE" && to != null) {
                    AmountText(to.amount, to.account?.currency, prefix = "→ +", color = c.muted, style = MaterialTheme.typography.titleMedium)
                }
                detail.breakdown?.marketAmount?.let { m ->
                    AmountText(m, detail.reportCurrency, prefix = "≈ ", color = c.muted, style = MaterialTheme.typography.bodyMedium)
                }
                Text(tx.description, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
            }

            HorizontalDivider(color = c.line)
            Field("Fecha", Dates.label(Dates.localDate(tx.date)))
            Field(if (tx.type == "INCOME") "Cuenta destino" else if (legs != null) "Sale de" else "Cuenta", from?.name ?: "—")
            if (to != null) Field("Entra en", to.account?.name ?: "—")
            if (tx.type == "INCOME" || tx.type == "EXPENSE") Field("Categoría", tx.category?.name ?: "sin categoría", dim = tx.category == null)
            tx.notes?.takeIf { it.isNotBlank() }?.let { Field("Nota", it) }
            if (tx.source == "telegram") Field("Entró por", "Telegram")
            if (tx.status == "REJECTED") {
                Text(
                    "Rechazado: ${tx.rejectionReason.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = c.danger,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).background(c.danger.copy(alpha = 0.10f), EcoShape.field).padding(8.dp),
                )
            }

            detail.breakdown?.let { b -> detail.reportCurrency?.let { r -> FxDetail(b, r) } }
            if (detail.history.isNotEmpty()) History(detail.history)
            Spacer(Modifier.height(8.dp))
        }

        error?.let { Text(it, color = c.danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp)) }
        if (canEdit) {
            Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onDelete, Modifier.weight(1f).height(48.dp), enabled = !busy, shape = EcoShape.field, border = BorderStroke(1.dp, c.line)) {
                    Icon(Icons.Outlined.DeleteOutline, null, tint = c.danger, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Borrar", color = c.danger, style = MaterialTheme.typography.labelLarge)
                }
                Button(
                    onEdit, Modifier.weight(1f).height(48.dp), enabled = !busy, shape = EcoShape.field,
                    colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.onAccent),
                ) {
                    Icon(Icons.Outlined.Edit, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Editar", style = MaterialTheme.typography.labelLarge)
                }
            }
        } else Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun Field(label: String, value: String, dim: Boolean = false) {
    val c = Eco.colors
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = c.muted, modifier = Modifier.width(112.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = if (dim) c.muted else c.text, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = Eco.colors.muted, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
}

/**
 * El gasto en la moneda de estadísticas, como la NIC 21 (igual que la web): a
 * mercado del día, lo que costó por FIFO y la diferencia de cambio entre los
 * dos. Debajo, de qué cambios salió.
 */
@Composable
private fun FxDetail(b: BreakdownDto, report: String) {
    val c = Eco.colors
    SectionLabel(if (b.status == "ESTIMATE") "En $report · estimado" else "En $report")
    if (b.marketAmount == null || b.reportAmount == null) {
        if (b.status == "MISSING_RATE") Text("Falta una tasa para valorarlo.", style = MaterialTheme.typography.bodySmall, color = c.warning)
        return
    }
    val tone = { v: Long? -> when { v == null || v == 0L -> c.text; v < 0 -> c.danger; else -> c.income } }
    FxRow("A mercado del día", b.marketAmount, report)
    FxRow("Costo real (FIFO)", b.reportAmount, report)
    FxRow("Diferencia de cambio", b.fxResult, report, signed = true, color = tone(b.fxResult))
    FxRow("   por cambio", b.fxExchange ?: 0, report, signed = true, color = tone(b.fxExchange), small = true)
    FxRow("   por retener", b.fxHolding ?: 0, report, signed = true, color = tone(b.fxHolding), small = true)
    b.parts.forEach { p ->
        Text("· " + HistoryText.part(p), style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun FxRow(label: String, cents: Long?, currency: String, signed: Boolean = false, color: Color = Eco.colors.text, small: Boolean = false) {
    val c = Eco.colors
    val style = if (small) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = style, color = c.muted, modifier = Modifier.weight(1f))
        if (cents == null) Text("—", style = style, color = c.muted)
        else AmountText(cents, currency, prefix = if (signed && cents > 0) "+" else "", color = color, style = style)
    }
}

@Composable
private fun History(entries: List<HistoryEntryDto>) {
    val c = Eco.colors
    SectionLabel("Historial")
    entries.forEach { e ->
        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(HistoryText.title(e), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Text(Dates.stamp(e.at), style = MaterialTheme.typography.bodySmall, color = c.muted)
            }
            e.reason?.takeIf { it.isNotBlank() }?.let {
                Text("Motivo: $it", style = MaterialTheme.typography.bodySmall, color = c.muted)
            }
            e.changes.forEach { ch ->
                Text(HistoryText.change(ch), style = MaterialTheme.typography.bodySmall, color = c.muted)
            }
        }
    }
}

@Composable
private fun Tag(text: String, color: Color) {
    Text(
        text, style = MaterialTheme.typography.labelMedium, color = color,
        modifier = Modifier.border(1.dp, color.copy(alpha = 0.6f), EcoShape.field).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun DeleteDialog(description: String, pair: Boolean, onDismiss: () -> Unit, onDelete: (String) -> Unit) {
    val c = Eco.colors
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Borrar") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "\"$description\" va a la papelera y deja de contar en los saldos" +
                        (if (pair) " (las dos partes)" else "") + ". Se puede restaurar desde la web.",
                    color = c.muted,
                )
                OutlinedTextField(reason, { reason = it }, Modifier.fillMaxWidth(), placeholder = { Text("Motivo (p. ej. estaba repetido)") }, minLines = 2, shape = EcoShape.field)
            }
        },
        confirmButton = { TextButton({ onDelete(reason) }, enabled = reason.trim().length >= 3) { Text("Borrar", color = c.danger) } },
        dismissButton = { TextButton(onDismiss) { Text("Cancelar", color = c.muted) } },
    )
}
