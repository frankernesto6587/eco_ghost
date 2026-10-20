package com.merxbit.ecoghost.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.merxbit.ecoghost.BuildConfig
import com.merxbit.ecoghost.data.net.OrgDto
import com.merxbit.ecoghost.data.net.UserDto
import com.merxbit.ecoghost.ui.common.Avatar
import com.merxbit.ecoghost.ui.common.EcoCard
import com.merxbit.ecoghost.ui.common.SectionTitle
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import com.merxbit.ecoghost.ui.theme.ThemeMode
import com.merxbit.ecoghost.update.Updater

private val ROLES = mapOf("OWNER" to "Dueño", "ADMIN" to "Administrador", "ACCOUNTANT" to "Contable", "VIEWER" to "Solo lectura")
fun roleLabel(role: String) = ROLES[role] ?: role

@Composable
fun MoreScreen(
    user: UserDto,
    org: OrgDto,
    theme: ThemeMode,
    onTheme: (ThemeMode) -> Unit,
    onSwitchOrg: () -> Unit,
    onLogout: () -> Unit,
    /** null para el visualizador (no anota ni aprueba). */
    onApprovals: (() -> Unit)? = null,
) {
    val c = Eco.colors
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        Text("Más", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
        EcoCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(user.name, 44)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(user.name, style = MaterialTheme.typography.titleMedium)
                    Text(user.email, style = MaterialTheme.typography.bodySmall, color = c.muted)
                }
            }
        }

        SectionTitle("Organización")
        EcoCard(Modifier.fillMaxWidth().clickable(onClick = onSwitchOrg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Storefront, null, tint = c.accent)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(org.name, style = MaterialTheme.typography.titleSmall)
                    Text("${roleLabel(org.role)} · moneda ${org.baseCurrency}", style = MaterialTheme.typography.bodySmall, color = c.muted)
                }
                Text("Cambiar", color = c.accent, style = MaterialTheme.typography.labelMedium)
            }
        }
        onApprovals?.let { open ->
            EcoCard(Modifier.fillMaxWidth().padding(top = 8.dp).clickable(onClick = open)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.FactCheck, null, tint = c.accent)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Aprobaciones", style = MaterialTheme.typography.titleSmall)
                        Text(
                            if (org.role == "OWNER" || org.role == "ADMIN") "Revisar lo que anotan los demás y tus envíos" else "Tus envíos pendientes y rechazados",
                            style = MaterialTheme.typography.bodySmall, color = c.muted,
                        )
                    }
                }
            }
        }

        SectionTitle("Tema")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            val opts = listOf(ThemeMode.SYSTEM to "Sistema", ThemeMode.LIGHT to "Claro", ThemeMode.DARK to "Oscuro")
            opts.forEachIndexed { i, (mode, label) ->
                SegmentedButton(
                    selected = theme == mode, onClick = { onTheme(mode) },
                    shape = SegmentedButtonDefaults.itemShape(i, opts.size, EcoShape.field),
                    colors = SegmentedButtonDefaults.colors(activeContainerColor = c.accentSoft, activeContentColor = c.text),
                ) { Text(label) }
            }
        }

        SectionTitle("Sesión")
        EcoCard(Modifier.fillMaxWidth().clickable(onClick = onLogout)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Outlined.Logout, null, tint = c.danger)
                Spacer(Modifier.width(12.dp))
                Text("Cerrar sesión", color = c.danger, style = MaterialTheme.typography.titleSmall)
            }
        }

        Text(
            "EcoGhost ${Updater.currentName(ctx)}" + if (BuildConfig.FLAVOR == "prueba") " · entorno de pruebas" else "",
            style = MaterialTheme.typography.bodySmall, color = c.muted,
            modifier = Modifier.padding(vertical = 24.dp),
        )
    }
}

/** Lista de organizaciones para la hoja de "cambiar organización". */
@Composable
fun OrgList(orgs: List<OrgDto>, current: OrgDto?, onPick: (OrgDto) -> Unit) {
    val c = Eco.colors
    Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        Text("Tus organizaciones", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 8.dp))
        orgs.forEachIndexed { i, o ->
            if (i > 0) HorizontalDivider(color = c.line)
            Row(
                Modifier.fillMaxWidth().clickable { onPick(o) }.padding(vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Storefront, null, tint = c.muted)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(o.name, style = MaterialTheme.typography.titleSmall)
                    Text("${roleLabel(o.role)} · ${o.baseCurrency}", style = MaterialTheme.typography.bodySmall, color = c.muted)
                }
                if (o.id == current?.id) Icon(Icons.Outlined.Check, "Actual", tint = c.accent, modifier = Modifier.size(20.dp))
            }
        }
    }
}
