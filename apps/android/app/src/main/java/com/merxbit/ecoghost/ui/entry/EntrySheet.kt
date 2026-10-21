package com.merxbit.ecoghost.ui.entry

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
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
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.data.AmountInput
import com.merxbit.ecoghost.data.ApprovalsRepository
import com.merxbit.ecoghost.data.Category
import com.merxbit.ecoghost.data.CategoryGroup
import com.merxbit.ecoghost.data.Dates
import com.merxbit.ecoghost.data.Draft
import com.merxbit.ecoghost.data.EntryData
import com.merxbit.ecoghost.data.EntryRepository
import com.merxbit.ecoghost.data.EntryType
import com.merxbit.ecoghost.data.Money
import com.merxbit.ecoghost.data.RateHint
import com.merxbit.ecoghost.data.RateHints
import com.merxbit.ecoghost.data.net.RateSuggestionDto
import com.merxbit.ecoghost.data.errorMessage
import com.merxbit.ecoghost.ui.common.accountIcon
import com.merxbit.ecoghost.ui.common.categoryIcon
import com.merxbit.ecoghost.ui.common.parseColor
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import javax.inject.Inject

/** Estado de la hoja mientras se rellena. Los importes van como texto tecleado. */
data class EntryForm(
    val type: EntryType = EntryType.EXPENSE,
    val amount: String = "",
    val toAmount: String = "",
    /** El teclado escribe en el importe recibido (solo en cambios de moneda). */
    val typingTo: Boolean = false,
    val accountId: String? = null,
    val toAccountId: String? = null,
    val categoryId: String? = null,
    val description: String = "",
    val date: LocalDate = LocalDate.now(),
    val notes: String = "",
    val showNotes: Boolean = false,
) {
    fun draft() = Draft(
        type, AmountInput.cents(amount), accountId, toAccountId, AmountInput.cents(toAmount),
        categoryId, description, date, notes,
    )

    /** Lo que se borra tras "Guardar y otro": se quedan el tipo, la cuenta y la fecha. */
    fun next() = copy(amount = "", toAmount = "", typingTo = false, categoryId = null, description = "", notes = "", showNotes = false)
}

@HiltViewModel
class EntryViewModel @Inject constructor(private val repo: EntryRepository) : ViewModel() {
    var data by mutableStateOf<EntryData?>(null); private set
    var form by mutableStateOf(EntryForm()); private set
    var loadError by mutableStateOf<String?>(null); private set
    var error by mutableStateOf<String?>(null); private set
    var saved by mutableStateOf<String?>(null); private set
    var saving by mutableStateOf(false); private set
    /** Tasa de elTOQUE del día del cambio, para sugerir lo que se recibe. */
    var rates by mutableStateOf<RateSuggestionDto?>(null); private set
    private var ratesDay: LocalDate? = null

    /** Cada apertura empieza de cero y recarga cuentas y categorías (pueden haber cambiado). */
    fun open(orgId: String) {
        form = EntryForm(); error = null; saved = null; loadError = null; rates = null; ratesDay = null
        viewModelScope.launch {
            runCatching { repo.load(orgId) }
                .onSuccess { data = it; form = form.copy(accountId = it.preferredAccountId) }
                .onFailure { loadError = errorMessage(it) }
        }
    }

    fun change(f: EntryForm) { form = f; error = null; loadRates() }

    /** Solo en un cambio de moneda, y una vez por fecha. */
    private fun loadRates() {
        val accounts = data?.accounts ?: return
        val from = accounts.firstOrNull { it.id == form.accountId } ?: return
        val to = accounts.firstOrNull { it.id == form.toAccountId } ?: return
        if (form.type != EntryType.TRANSFER || from.currency == to.currency || ratesDay == form.date) return
        val day = form.date
        ratesDay = day; rates = null
        viewModelScope.launch { repo.rates(day).let { if (ratesDay == day) rates = it } }
    }

    fun key(k: Char) {
        form = if (form.typingTo) form.copy(toAmount = AmountInput.press(form.toAmount, k))
        else form.copy(amount = AmountInput.press(form.amount, k))
        error = null; saved = null
    }

    fun save(orgId: String, again: Boolean, onDone: (String) -> Unit) {
        val d = data ?: return
        val draft = form.draft()
        EntryRepository.missing(draft, d)?.let { error = it; return }
        saving = true; error = null
        viewModelScope.launch {
            runCatching { repo.save(orgId, draft, d) }
                .onSuccess { status ->
                    val msg = savedMessage(draft, d, pending = status == "PENDING")
                    if (again) { form = form.next(); saved = msg } else onDone(msg)
                }
                .onFailure { error = errorMessage(it) }
            saving = false
        }
    }

    private fun savedMessage(d: Draft, data: EntryData, pending: Boolean): String {
        val req = EntryRepository.request(d, data)
        val cur = data.accounts.first { it.id == d.accountId }.currency
        val what = when (req.type) { "EXCHANGE" -> "Cambio"; "TRANSFER" -> "Transferencia"; else -> d.type.label }
        // Lo de quien no aprueba espera a un admin y aun no cuenta en los saldos
        val how = if (pending) "enviado · pendiente de aprobación" else "guardado"
        return "$what $how · ${req.description} · ${Money.format(d.amount)} $cur"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntrySheet(orgId: String, onDismiss: () -> Unit, onSaved: (String) -> Unit, vm: EntryViewModel = hiltViewModel()) {
    LaunchedEffect(orgId) { vm.open(orgId) }
    val c = Eco.colors
    ModalBottomSheet(
        onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.surface, shape = EcoShape.sheet,
    ) {
        val data = vm.data
        when {
            vm.loadError != null -> Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(vm.loadError!!, color = c.muted)
                TextButton({ vm.open(orgId) }) { Text("Reintentar", color = c.accent) }
            }
            data == null -> Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = c.accent)
            }
            else -> EntryContent(
                vm.form, data, vm.saving, vm.error, vm.saved, vm.rates,
                onChange = vm::change, onKey = vm::key, onClose = onDismiss,
                onSave = { again -> vm.save(orgId, again) { msg -> onSaved(msg); onDismiss() } },
            )
        }
    }
}

/** Solo pinta (sin ViewModel), para poder sacarle capturas en los tests. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EntryContent(
    form: EntryForm,
    data: EntryData,
    saving: Boolean,
    error: String?,
    saved: String?,
    rates: RateSuggestionDto?,
    onChange: (EntryForm) -> Unit,
    onKey: (Char) -> Unit,
    onClose: () -> Unit,
    onSave: (again: Boolean) -> Unit,
) {
    val c = Eco.colors
    var pickDate by remember { mutableStateOf(false) }
    var pickCategory by remember { mutableStateOf(false) }
    val from = data.accounts.firstOrNull { it.id == form.accountId }
    val to = data.accounts.firstOrNull { it.id == form.toAccountId }
    val move = form.type == EntryType.TRANSFER
    val exchange = move && from != null && to != null && to.currency != from.currency

    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp)) {
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Anotar", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                IconButton(onClose) { Icon(Icons.Outlined.Close, "Cerrar", tint = c.muted) }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                EntryType.entries.forEachIndexed { i, t ->
                    SegmentedButton(
                        selected = form.type == t,
                        onClick = { onChange(form.copy(type = t, typingTo = false, categoryId = null)) },
                        shape = SegmentedButtonDefaults.itemShape(i, EntryType.entries.size, EcoShape.field),
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = c.accentSoft, activeContentColor = c.accent, activeBorderColor = c.line,
                            inactiveContainerColor = c.surface, inactiveContentColor = c.text, inactiveBorderColor = c.line,
                        ),
                        icon = {},
                    ) { Text(t.label, style = MaterialTheme.typography.labelLarge) }
                }
            }

            AmountField(
                form.amount, from?.currency, active = !form.typingTo || !exchange,
                label = if (exchange) "Das" else null,
                color = if (form.type == EntryType.INCOME) c.income else c.text,
            ) { onChange(form.copy(typingTo = false)) }
            if (exchange) {
                AmountField(form.toAmount, to!!.currency, active = form.typingTo, label = "Recibes", color = c.text) {
                    onChange(form.copy(typingTo = true))
                }
                val a = AmountInput.cents(form.amount); val b = AmountInput.cents(form.toAmount)
                val hint = RateHints.exchange(from!!.currency, to.currency, rates, a, b, form.date)
                if (hint != null) {
                    RateHintLines(hint, to.currency) { onChange(form.copy(toAmount = ApprovalsRepository.centsText(it), typingTo = false)) }
                } else if (a > 0 && b > 0) {
                    Text(
                        "tasa ${Money.format((b * 100) / a)} ${to.currency}/${from.currency}",
                        style = MaterialTheme.typography.bodySmall, color = c.muted,
                        textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            OutlinedTextField(
                form.description, { onChange(form.copy(description = it)) }, Modifier.fillMaxWidth().padding(top = 8.dp),
                placeholder = { Text(if (move) "Motivo (p. ej. depósito del sábado)" else "¿En qué? (p. ej. cemento)", color = c.muted) },
                leadingIcon = { Icon(Icons.Outlined.Edit, null, tint = c.muted) },
                singleLine = true, shape = EcoShape.field, colors = fieldColors(),
            )

            Label(if (form.type == EntryType.INCOME) "Cuenta destino" else if (move) "Cuenta origen" else "Cuenta")
            ChipRow {
                data.accounts.forEach { a ->
                    EcoChip(a.name, form.accountId == a.id, accountIcon(a.type)) {
                        onChange(form.copy(accountId = a.id, toAccountId = form.toAccountId.takeIf { it != a.id }))
                    }
                }
            }

            if (move) {
                Label("Cuenta destino", if (exchange) "otra moneda: es un cambio" else null)
                ChipRow {
                    data.accounts.filter { it.id != form.accountId }.forEach { a ->
                        EcoChip("${a.name} · ${a.currency}", form.toAccountId == a.id, accountIcon(a.type)) {
                            onChange(form.copy(toAccountId = a.id, typingTo = false))
                        }
                    }
                }
            } else {
                Label("Categoría", "las que más usas")
                val shown = remember(form.type, form.categoryId, data) { quickCategories(form, data) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    shown.forEach { cat ->
                        EcoChip(cat.name, form.categoryId == cat.id, categoryIcon(cat.icon), parseColor(cat.color)) {
                            onChange(form.copy(categoryId = cat.id.takeIf { it != form.categoryId }))
                        }
                    }
                    EcoChip("Todas", false, Icons.Outlined.MoreHoriz) { pickCategory = true }
                }
            }

            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EcoChip(Dates.label(form.date), form.date != LocalDate.now(), Icons.Outlined.CalendarToday) { pickDate = true }
                EcoChip("Nota", form.showNotes, Icons.AutoMirrored.Outlined.Notes) { onChange(form.copy(showNotes = !form.showNotes)) }
            }
            if (form.showNotes) {
                OutlinedTextField(
                    form.notes, { onChange(form.copy(notes = it)) }, Modifier.fillMaxWidth().padding(top = 8.dp),
                    placeholder = { Text("Notas (opcional)", color = c.muted) }, minLines = 2,
                    shape = EcoShape.field, colors = fieldColors(),
                )
            }
        }

        error?.let { Text(it, color = c.danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp)) }
        saved?.let {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.CheckCircle, null, tint = c.income, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(it, color = c.income, style = MaterialTheme.typography.bodySmall, maxLines = 1)
            }
        }
        Keypad(onKey)
        Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                { onSave(true) }, Modifier.weight(1f).height(48.dp), enabled = !saving, shape = EcoShape.field,
                border = BorderStroke(1.dp, c.line),
            ) { Text("Guardar y otro", color = c.text, style = MaterialTheme.typography.labelLarge) }
            Button(
                { onSave(false) }, Modifier.weight(1f).height(48.dp), enabled = !saving, shape = EcoShape.field,
                colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.onAccent),
            ) {
                if (saving) CircularProgressIndicator(Modifier.size(20.dp), color = c.onAccent, strokeWidth = 2.dp)
                else Text("Guardar", style = MaterialTheme.typography.labelLarge)
            }
        }
    }

    if (pickDate) DateDialog(form.date, { pickDate = false }) { onChange(form.copy(date = it)); pickDate = false }
    if (pickCategory) CategoryPicker(data.groupsFor(form.type.name), form.categoryId, { pickCategory = false }) {
        onChange(form.copy(categoryId = it)); pickCategory = false
    }
}

/** Las 5 más usadas para el tipo; si aún no hay uso, las primeras. La elegida siempre se ve. Solo las de su tipo. */
private fun quickCategories(form: EntryForm, data: EntryData): List<Category> {
    val groups = data.groupsFor(form.type.name)
    val fit = groups.flatMap { listOf(it.root) + it.children }.associateBy { it.id }
    val used = data.usage[form.type].orEmpty().mapNotNull(fit::get)
    val base = used.ifEmpty { groups.flatMap { g -> g.children.ifEmpty { listOf(g.root) } } }.take(5)
    val chosen = form.categoryId?.let(fit::get)
    return if (chosen == null || chosen in base) base else listOf(chosen) + base
}

@Composable
private fun AmountField(text: String, currency: String?, active: Boolean, label: String?, color: Color, onClick: () -> Unit) {
    val c = Eco.colors
    Column(
        Modifier.fillMaxWidth().padding(top = 10.dp).clip(EcoShape.card).clickable(onClick = onClick)
            // En un cambio hay dos importes: el borde marca en cuál escribe el teclado
            .then(if (label != null) Modifier.border(1.dp, if (active) c.accent else c.line, EcoShape.card) else Modifier)
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        label?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = c.muted) }
        Text(
            buildAnnotatedString {
                append(AmountInput.display(text))
                currency?.let { withStyle(SpanStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = c.muted)) { append(" $it") } }
            },
            style = MaterialTheme.typography.displayLarge,
            color = if (text.isEmpty()) c.muted else color,
            maxLines = 1,
        )
    }
}

@Composable
private fun Keypad(onKey: (Char) -> Unit) {
    val c = Eco.colors
    Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("123", "456", "789", ",0⌫").forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { k ->
                    Box(
                        Modifier.weight(1f).height(46.dp).clip(EcoShape.field).background(c.surface2)
                            .border(1.dp, c.line, EcoShape.field).clickable { onKey(k) },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (k == '⌫') Icon(Icons.AutoMirrored.Outlined.Backspace, "Borrar", tint = c.text)
                        else Text(k.toString(), style = MaterialTheme.typography.titleLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun Label(text: String, hint: String? = null) {
    val c = Eco.colors
    Text(
        buildAnnotatedString {
            append(text.uppercase())
            hint?.let { withStyle(SpanStyle(color = c.muted.copy(alpha = 0.7f), fontWeight = FontWeight.Medium)) { append("  ·  $it") } }
        },
        style = MaterialTheme.typography.labelSmall, color = c.muted,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
    )
}

/** Las cuentas en varias filas: así la elegida nunca queda escondida fuera de la pantalla. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipRow(content: @Composable () -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}

@Composable
fun EcoChip(label: String, selected: Boolean, icon: ImageVector? = null, iconColor: Color? = null, onClick: () -> Unit) {
    val c = Eco.colors
    Row(
        Modifier.height(36.dp).clip(EcoShape.field)
            .background(if (selected) c.accentSoft else c.surface)
            .border(1.dp, if (selected) c.accent else c.line, EcoShape.field)
            .clickable(onClick = onClick).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon?.let { Icon(it, null, tint = if (selected) c.accent else iconColor ?: c.muted, modifier = Modifier.size(18.dp)) }
        if (icon != null) Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = if (selected) c.accent else c.text, maxLines = 1)
    }
}

@Composable
private fun fieldColors() = Eco.colors.let { c ->
    OutlinedTextFieldDefaults.colors(
        unfocusedBorderColor = c.line, focusedBorderColor = c.accent,
        unfocusedContainerColor = c.surface, focusedContainerColor = c.surface,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateDialog(date: LocalDate, onDismiss: () -> Unit, onPick: (LocalDate) -> Unit) {
    val c = Eco.colors
    // El DatePicker trabaja en milisegundos UTC
    val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
    DatePickerDialog(
        onDismiss,
        confirmButton = {
            TextButton({
                state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) } ?: onDismiss()
            }) { Text("Aceptar", color = c.accent) }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancelar", color = c.muted) } },
    ) { DatePicker(state, showModeToggle = false) }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun CategoryPicker(groups: List<CategoryGroup>, selected: String?, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val c = Eco.colors
    ModalBottomSheet(onDismiss, containerColor = c.surface, shape = EcoShape.sheet) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text("Categoría", style = MaterialTheme.typography.titleLarge)
            groups.forEach { g ->
                val color = parseColor(g.root.color)
                Row(
                    Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 8.dp).clip(EcoShape.card).clickable { onPick(g.root.id) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(categoryIcon(g.root.icon), null, tint = color ?: c.muted, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(g.root.name, style = MaterialTheme.typography.titleSmall, color = if (selected == g.root.id) c.accent else c.text)
                }
                if (g.children.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        g.children.forEach { ch -> EcoChip(ch.name, selected == ch.id) { onPick(ch.id) } }
                    }
                }
            }
        }
    }
}

/** La tasa de elTOQUE bajo "Recibes", cómo queda la del cambio y "Usar". También en Aprobaciones. */
@Composable
fun RateHintLines(hint: RateHint, currency: String, onUse: (Long) -> Unit) {
    val c = Eco.colors
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(hint.market, style = MaterialTheme.typography.bodySmall, color = c.muted, textAlign = TextAlign.Center)
        hint.mine?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.muted, textAlign = TextAlign.Center) }
        hint.suggested?.let { v ->
            TextButton({ onUse(v) }) { Text("Usar: ${Money.format(v, currency)}", color = c.accent, style = MaterialTheme.typography.labelLarge) }
        }
    }
}
