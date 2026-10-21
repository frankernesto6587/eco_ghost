package com.merxbit.ecoghost.ui.approvals

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.data.ApprovalsRepository
import com.merxbit.ecoghost.data.Dates
import com.merxbit.ecoghost.data.EntryData
import com.merxbit.ecoghost.data.EntryRepository
import com.merxbit.ecoghost.data.RateHints
import com.merxbit.ecoghost.data.errorMessage
import com.merxbit.ecoghost.data.net.ApprovalCountsDto
import com.merxbit.ecoghost.data.net.ApprovalItemDto
import com.merxbit.ecoghost.data.net.EditRequest
import com.merxbit.ecoghost.data.net.RateSuggestionDto
import com.merxbit.ecoghost.ui.common.AmountText
import com.merxbit.ecoghost.ui.common.accountIcon
import com.merxbit.ecoghost.ui.entry.EcoChip
import com.merxbit.ecoghost.ui.entry.RateHintLines
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

private val KIND_LABEL = mapOf(
    "INCOME" to "Ingreso", "EXPENSE" to "Gasto", "TRANSFER" to "Transferencia",
    "EXCHANGE" to "Cambio", "DEBT_CREATE" to "Deuda nueva", "DEBT_PAYMENT" to "Pago de deuda",
)

@HiltViewModel
class ApprovalsViewModel @Inject constructor(
    private val repo: ApprovalsRepository,
    private val entry: EntryRepository,
) : ViewModel() {
    var scope by mutableStateOf("review"); private set
    var items by mutableStateOf<List<ApprovalItemDto>>(emptyList()); private set
    var counts by mutableStateOf(ApprovalCountsDto()); private set
    var loading by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    /** Cuentas y categorias para corregir (se cargan al abrir). */
    var data by mutableStateOf<EntryData?>(null); private set
    /** Tasa de elTOQUE del dia del cambio que se corrige. */
    var rates by mutableStateOf<RateSuggestionDto?>(null); private set
    private var orgId: String? = null

    fun loadRates(item: ApprovalItemDto) {
        rates = null
        if (item.kind != "EXCHANGE") return
        viewModelScope.launch { rates = entry.rates(Dates.localDate(item.date)) }
    }

    fun open(org: String, canApprove: Boolean) {
        if (orgId != org) { orgId = org; scope = if (canApprove) "review" else "mine" }
        refresh()
        viewModelScope.launch { runCatching { entry.load(org) }.onSuccess { data = it } }
    }

    fun changeScope(s: String) { scope = s; refresh() }

    fun refresh() {
        loading = true
        viewModelScope.launch {
            runCatching { repo.list(scope) }
                .onSuccess { items = it.data; counts = it.counts; error = null }
                .onFailure { error = errorMessage(it) }
            loading = false
        }
    }

    /** Ejecuta una accion, refresca la lista y cuenta como fue. */
    fun act(done: String, onMessage: (String) -> Unit, block: suspend ApprovalsRepository.() -> Unit) {
        busy = true
        viewModelScope.launch {
            runCatching { repo.block() }
                .onSuccess { onMessage(done) }
                .onFailure { onMessage(errorMessage(it)) }
            busy = false
            refresh()
        }
    }
}

@Composable
fun ApprovalsScreen(orgId: String, canApprove: Boolean, onBack: () -> Unit, onMessage: (String) -> Unit, vm: ApprovalsViewModel = hiltViewModel()) {
    LaunchedEffect(orgId) { vm.open(orgId, canApprove) }
    BackHandler(onBack = onBack)
    var correcting by remember { mutableStateOf<ApprovalItemDto?>(null) }
    var rejecting by remember { mutableStateOf<ApprovalItemDto?>(null) }
    var withdrawing by remember { mutableStateOf<ApprovalItemDto?>(null) }

    ApprovalsContent(
        scope = vm.scope, canApprove = canApprove, items = vm.items, counts = vm.counts,
        loading = vm.loading, busy = vm.busy, error = vm.error,
        onScope = vm::changeScope, onBack = onBack, onRetry = vm::refresh,
        onApprove = { item -> vm.act("Aprobado", onMessage) { approve(item.id, null) } },
        onCorrect = { correcting = it; vm.loadRates(it) },
        onReject = { rejecting = it },
        onResubmit = { item -> vm.act("Reenviado", onMessage) { resubmit(item.id) } },
        onWithdraw = { withdrawing = it },
    )

    correcting?.let { item ->
        val review = vm.scope == "review"
        CorrectSheet(item, vm.data, vm.rates, review, onDismiss = { correcting = null }) { edits ->
            correcting = null
            if (review) vm.act(if (edits != null) "Aprobado con correcciones" else "Aprobado", onMessage) { approve(item.id, edits) }
            else vm.act("Enviado otra vez a revisión", onMessage) { edit(item.id, edits ?: EditRequest()) }
        }
    }
    rejecting?.let { item ->
        RejectDialog(item, onDismiss = { rejecting = null }) { reason ->
            rejecting = null
            vm.act("Rechazado", onMessage) { reject(item.id, reason) }
        }
    }
    withdrawing?.let { item ->
        AlertDialog(
            onDismissRequest = { withdrawing = null },
            title = { Text("Retirar") },
            text = { Text("\"${item.description}\" se quita y no contará en ningún número.") },
            confirmButton = {
                TextButton({ withdrawing = null; vm.act("Retirado", onMessage) { withdraw(item.id) } }) {
                    Text("Retirar", color = Eco.colors.danger)
                }
            },
            dismissButton = { TextButton({ withdrawing = null }) { Text("Cancelar", color = Eco.colors.muted) } },
        )
    }
}

/** Solo pinta (sin ViewModel), para las capturas de los tests. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalsContent(
    scope: String,
    canApprove: Boolean,
    items: List<ApprovalItemDto>,
    counts: ApprovalCountsDto,
    loading: Boolean,
    busy: Boolean,
    error: String?,
    onScope: (String) -> Unit,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onApprove: (ApprovalItemDto) -> Unit,
    onCorrect: (ApprovalItemDto) -> Unit,
    onReject: (ApprovalItemDto) -> Unit,
    onResubmit: (ApprovalItemDto) -> Unit,
    onWithdraw: (ApprovalItemDto) -> Unit,
) {
    val c = Eco.colors
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Volver") }
                Text("Aprobaciones", style = MaterialTheme.typography.headlineMedium)
            }
            Text(
                if (canApprove) "${counts.toReview} por revisar · solo cuenta lo aprobado"
                else "${counts.mine.pending} esperando · ${counts.mine.rejected} rechazados",
                style = MaterialTheme.typography.bodySmall, color = c.muted,
            )
            if (canApprove) {
                val options = listOf("review" to "Por revisar (${counts.toReview})", "mine" to "Mis envíos (${counts.mine.pending + counts.mine.rejected})")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    options.forEachIndexed { i, (value, label) ->
                        SegmentedButton(
                            selected = scope == value, onClick = { onScope(value) },
                            shape = SegmentedButtonDefaults.itemShape(i, options.size, EcoShape.field),
                            colors = SegmentedButtonDefaults.colors(
                                activeContainerColor = c.accentSoft, activeContentColor = c.accent, activeBorderColor = c.line,
                                inactiveContainerColor = c.surface, inactiveContentColor = c.text, inactiveBorderColor = c.line,
                            ),
                            icon = {},
                        ) { Text(label, style = MaterialTheme.typography.labelLarge) }
                    }
                }
            }
        }
        error?.let {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(it, color = c.muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    TextButton(onRetry) { Text("Reintentar", color = c.accent) }
                }
            }
        }
        if (loading && items.isEmpty()) item {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
        }
        if (!loading && items.isEmpty() && error == null) item {
            Text(
                if (scope == "review") "Nada por revisar." else "No tienes envíos pendientes ni rechazados.",
                color = c.muted, modifier = Modifier.padding(vertical = 24.dp),
            )
        }
        items(items, key = { it.id }) { item ->
            ApprovalCard(item, review = scope == "review", busy = busy, onApprove, onCorrect, onReject, onResubmit, onWithdraw)
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ApprovalCard(
    item: ApprovalItemDto,
    review: Boolean,
    busy: Boolean,
    onApprove: (ApprovalItemDto) -> Unit,
    onCorrect: (ApprovalItemDto) -> Unit,
    onReject: (ApprovalItemDto) -> Unit,
    onResubmit: (ApprovalItemDto) -> Unit,
    onWithdraw: (ApprovalItemDto) -> Unit,
) {
    val c = Eco.colors
    val rejected = item.status == "REJECTED"
    val incoming = item.kind == "INCOME" ||
        (item.kind == "DEBT_PAYMENT" && item.debt?.type == "RECEIVABLE") ||
        (item.kind == "DEBT_CREATE" && item.debt?.type == "PAYABLE")
    Column(
        Modifier.fillMaxWidth().background(c.surface, EcoShape.card)
            .border(1.dp, if (rejected) c.danger.copy(alpha = 0.5f) else c.line, EcoShape.card).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Tag(KIND_LABEL[item.kind] ?: item.kind, c.muted)
            Spacer(Modifier.size(6.dp))
            Tag(if (rejected) "Rechazado" else "Por aprobar", if (rejected) c.danger else c.warning)
            Spacer(Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.End) {
                AmountText(
                    item.from.amount, item.from.currency,
                    prefix = if (incoming) "+" else if (item.to != null) "" else "−",
                    color = if (incoming) c.income else c.text,
                )
                item.to?.let { AmountText(it.amount, it.currency, prefix = "→ ", color = c.muted, style = MaterialTheme.typography.bodySmall) }
            }
        }
        Text(item.description, style = MaterialTheme.typography.titleSmall)
        val where = buildString {
            append(Dates.label(Dates.localDate(item.date)))
            append(" · ").append(item.from.accountName)
            item.to?.let { append(" → ").append(it.accountName) }
            item.category?.let { append(" · ").append(it.name) }
            item.debt?.let { append(" · Deuda: ").append(it.personName) }
        }
        Text(where, style = MaterialTheme.typography.bodySmall, color = c.muted)
        val who = (if (review) "Anotó ${item.author.name ?: "?"}" else "Enviado") + if (item.source == "telegram") " · por Telegram" else ""
        Text(who, style = MaterialTheme.typography.bodySmall, color = c.muted)
        if (rejected) {
            Text(
                "Rechazado por ${item.reviewer?.name ?: "?"}: ${item.rejectionReason.orEmpty()}",
                style = MaterialTheme.typography.bodySmall, color = c.danger,
                modifier = Modifier.fillMaxWidth().background(c.danger.copy(alpha = 0.10f), EcoShape.field).padding(8.dp),
            )
        }
        FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (review) {
                Primary("Aprobar", busy) { onApprove(item) }
                Secondary("Corregir", busy) { onCorrect(item) }
                Secondary("Rechazar", busy, c.danger) { onReject(item) }
            } else {
                if (rejected) Primary("Corregir y reenviar", busy) { onCorrect(item) } else Secondary("Editar", busy) { onCorrect(item) }
                if (rejected) Secondary("Reenviar igual", busy) { onResubmit(item) }
                Secondary("Retirar", busy, c.danger) { onWithdraw(item) }
            }
        }
    }
}

@Composable
private fun Tag(text: String, color: androidx.compose.ui.graphics.Color) {
    Text(
        text, style = MaterialTheme.typography.labelMedium, color = color,
        modifier = Modifier.border(1.dp, color.copy(alpha = 0.6f), EcoShape.field).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun Primary(label: String, busy: Boolean, onClick: () -> Unit) {
    val c = Eco.colors
    Button(onClick, enabled = !busy, shape = EcoShape.field, colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.onAccent)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun Secondary(label: String, busy: Boolean, color: androidx.compose.ui.graphics.Color = Eco.colors.text, onClick: () -> Unit) {
    OutlinedButton(onClick, enabled = !busy, shape = EcoShape.field, border = androidx.compose.foundation.BorderStroke(1.dp, Eco.colors.line)) {
        Text(label, color = color, style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Corregir antes de aprobar (quien aprueba) o corregir lo propio (el autor).
 * Solo se envia lo que cambia.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun CorrectSheet(item: ApprovalItemDto, data: EntryData?, rates: RateSuggestionDto?, review: Boolean, onDismiss: () -> Unit, onSubmit: (EditRequest?) -> Unit) {
    val c = Eco.colors
    var description by remember { mutableStateOf(item.description) }
    var amount by remember { mutableStateOf(ApprovalsRepository.centsText(item.from.amount)) }
    var toAmount by remember { mutableStateOf(item.to?.let { ApprovalsRepository.centsText(it.amount) } ?: "") }
    var accountId by remember { mutableStateOf(item.from.accountId) }
    var categoryId by remember { mutableStateOf(item.category?.id) }
    val pair = item.to != null
    val debt = item.debt != null
    val fieldColors = OutlinedTextFieldDefaults.colors(
        unfocusedBorderColor = c.line, focusedBorderColor = c.accent,
        unfocusedContainerColor = c.surface, focusedContainerColor = c.surface,
    )

    ModalBottomSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.surface, shape = EcoShape.sheet) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(if (review) "Corregir y aprobar" else "Corregir", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text("Descripción") }, singleLine = true, shape = EcoShape.field, colors = fieldColors)
            OutlinedTextField(
                amount, { amount = it }, Modifier.fillMaxWidth(), label = { Text("Importe (${item.from.currency})") },
                singleLine = true, shape = EcoShape.field, colors = fieldColors,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
            if (item.kind == "EXCHANGE") {
                OutlinedTextField(
                    toAmount, { toAmount = it }, Modifier.fillMaxWidth(), label = { Text("Recibe (${item.to?.currency})") },
                    singleLine = true, shape = EcoShape.field, colors = fieldColors,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                item.to?.let { to ->
                    RateHints.exchange(
                        item.from.currency, to.currency, rates,
                        ApprovalsRepository.cents(amount), ApprovalsRepository.cents(toAmount), Dates.localDate(item.date),
                    )?.let { hint -> RateHintLines(hint, to.currency) { toAmount = ApprovalsRepository.centsText(it) } }
                }
            }
            // En un par no se cambian las cuentas aqui; en una deuda, solo por otra de la misma moneda.
            if (!pair && data != null) {
                Text("CUENTA", style = MaterialTheme.typography.labelSmall, color = c.muted)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.accounts.filter { it.currency == item.from.currency || !debt }.forEach { a ->
                        EcoChip(a.name, accountId == a.id, accountIcon(a.type)) { accountId = a.id }
                    }
                }
            }
            if (!pair && !debt && data != null) {
                Text("CATEGORÍA", style = MaterialTheme.typography.labelSmall, color = c.muted)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.groupsFor(item.kind).flatMap { g -> g.children.ifEmpty { listOf(g.root) } }.forEach { cat ->
                        EcoChip(cat.name, categoryId == cat.id) { categoryId = cat.id }
                    }
                }
            }
            if (review) {
                Text("Se guarda lo que envió ${item.author.name ?: "el autor"} y se le avisa de las correcciones.", style = MaterialTheme.typography.bodySmall, color = c.muted)
            }
            Button(
                { onSubmit(ApprovalsRepository.edits(item, description, amount, accountId, categoryId, toAmount)) },
                Modifier.fillMaxWidth().height(48.dp), shape = EcoShape.field,
                colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.onAccent),
            ) { Text(if (review) "Aprobar" else "Guardar y enviar", style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
private fun RejectDialog(item: ApprovalItemDto, onDismiss: () -> Unit, onReject: (String) -> Unit) {
    val c = Eco.colors
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rechazar") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${item.author.name ?: "El autor"} verá el motivo y podrá corregirlo y reenviarlo.", color = c.muted)
                OutlinedTextField(reason, { reason = it }, Modifier.fillMaxWidth(), placeholder = { Text("Motivo (p. ej. fue por BANDEC)") }, minLines = 2, shape = EcoShape.field)
            }
        },
        confirmButton = {
            TextButton({ onReject(reason) }, enabled = reason.trim().length >= 3) { Text("Rechazar", color = c.danger) }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancelar", color = c.muted) } },
    )
}
