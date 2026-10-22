package com.merxbit.ecoghost.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.merxbit.ecoghost.data.AuthRepository
import com.merxbit.ecoghost.data.Session
import com.merxbit.ecoghost.data.session.SessionStore
import com.merxbit.ecoghost.ui.approvals.ApprovalsScreen
import com.merxbit.ecoghost.ui.entry.EntrySheet
import com.merxbit.ecoghost.ui.home.HomeScreen
import com.merxbit.ecoghost.ui.login.LoginScreen
import com.merxbit.ecoghost.ui.more.MoreScreen
import com.merxbit.ecoghost.ui.more.OrgList
import com.merxbit.ecoghost.ui.movements.MovementDetailSheet
import com.merxbit.ecoghost.ui.movements.MovementsScreen
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import com.merxbit.ecoghost.ui.theme.ThemeMode
import kotlinx.coroutines.launch

private enum class Tab { HOME, TXS, DEBTS, ANALYSIS, MORE }

@Composable
fun AppRoot(auth: AuthRepository, store: SessionStore, theme: ThemeMode) {
    val session by auth.session.collectAsState()
    val c = Eco.colors
    Box(Modifier.fillMaxSize().background(c.bg)) {
        when (val s = session) {
            Session.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
            Session.LoggedOut -> LoginScreen()
            is Session.Offline -> Offline(s.message) { auth.restore() }
            is Session.LoggedIn -> if (s.org == null) PickOrg(s, auth) else Main(s, auth, store, theme)
        }
    }
}

@Composable
private fun Offline(message: String, retry: suspend () -> Unit) {
    val scope = rememberCoroutineScope()
    val c = Eco.colors
    Column(
        Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.CloudOff, null, tint = c.muted, modifier = Modifier.size(40.dp))
        Text(message, style = MaterialTheme.typography.titleMedium)
        Text("Revisa la conexión y vuelve a intentarlo.", color = c.muted)
        Button({ scope.launch { retry() } }, shape = EcoShape.field, colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.onAccent)) {
            Text("Reintentar")
        }
    }
}

@Composable
private fun PickOrg(s: Session.LoggedIn, auth: AuthRepository) {
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(top = 32.dp)) {
        if (s.orgs.isEmpty()) {
            Text("No perteneces a ninguna organización todavía.", modifier = Modifier.padding(16.dp))
            TextButton({ scope.launch { auth.logout() } }, Modifier.padding(horizontal = 8.dp)) { Text("Cerrar sesión") }
        } else {
            OrgList(s.orgs, null) { scope.launch { auth.selectOrg(it) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Main(s: Session.LoggedIn, auth: AuthRepository, store: SessionStore, theme: ThemeMode) {
    val org = s.org ?: return
    var tab by rememberSaveable { mutableStateOf(Tab.HOME) }
    var orgSheet by remember { mutableStateOf(false) }
    var entry by remember { mutableStateOf(false) }
    var approvals by rememberSaveable { mutableStateOf(false) }
    /** El movimiento cuyo detalle está abierto. */
    var detail by remember { mutableStateOf<String?>(null) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val c = Eco.colors
    // El visualizador solo mira: no ve el botón de anotar
    val canWrite = org.role != "VIEWER"
    val canApprove = org.role == "OWNER" || org.role == "ADMIN"

    BackHandler(tab != Tab.HOME) { tab = Tab.HOME }

    Scaffold(
        containerColor = c.bg,
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            BottomBar(tab, canWrite, onTab = { tab = it; approvals = false }, onAdd = { entry = true })
        },
    ) { pad ->
        Box(Modifier.padding(pad).statusBarsPadding()) {
            if (approvals) {
                ApprovalsScreen(org.id, canApprove, onBack = { approvals = false }, onMessage = { msg -> scope.launch { snack.showSnackbar(msg) } })
            } else when (tab) {
                Tab.HOME -> HomeScreen(
                    org, s.user.name, onOrgClick = { orgSheet = true }, onAvatarClick = { tab = Tab.MORE },
                    onSeeAll = { tab = Tab.TXS }, onApprovals = { approvals = true }, onOpen = { detail = it },
                )
                Tab.TXS -> MovementsScreen(org.id, onOpen = { detail = it })
                Tab.DEBTS -> Soon("Deudas", "Lo que te deben y lo que debes, con sus pagos.")
                Tab.ANALYSIS -> Soon("Análisis", "Gastos por categoría, meses y presupuestos.")
                Tab.MORE -> MoreScreen(
                    s.user, org, theme,
                    onTheme = { scope.launch { store.setTheme(it) } },
                    onSwitchOrg = { orgSheet = true },
                    onLogout = { scope.launch { auth.logout() } },
                    onApprovals = if (canWrite) ({ approvals = true }) else null,
                )
            }
        }
    }

    if (entry) {
        EntrySheet(org.id, onDismiss = { entry = false }, onSaved = { msg -> scope.launch { snack.showSnackbar(msg) } })
    }

    detail?.let { id ->
        // Editar y borrar: propietario y admin (la API no deja a los demás)
        MovementDetailSheet(id, org.id, canEdit = canApprove, onDismiss = { detail = null }, onMessage = { msg -> scope.launch { snack.showSnackbar(msg) } })
    }

    if (orgSheet) {
        ModalBottomSheet({ orgSheet = false }, containerColor = c.surface, shape = EcoShape.sheet) {
            OrgList(s.orgs, org) {
                orgSheet = false
                scope.launch { auth.selectOrg(it) }
            }
        }
    }
}

@Composable
private fun Soon(title: String, text: String) {
    val c = Eco.colors
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text("$text\nLlega en la próxima versión.", color = c.muted, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun BottomBar(tab: Tab, canWrite: Boolean, onTab: (Tab) -> Unit, onAdd: () -> Unit) {
    val c = Eco.colors
    Column(Modifier.background(c.surface).navigationBarsPadding()) {
        HorizontalDivider(color = c.line)
        Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
            TabItem(Icons.Outlined.Home, "Inicio", tab == Tab.HOME, Modifier.weight(1f)) { onTab(Tab.HOME) }
            TabItem(Icons.Outlined.ReceiptLong, "Movim.", tab == Tab.TXS, Modifier.weight(1f)) { onTab(Tab.TXS) }
            if (canWrite) Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.size(48.dp).clip(EcoShape.fab).background(c.accent).clickable(onClick = onAdd),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Outlined.Add, "Anotar", tint = c.onAccent, modifier = Modifier.size(28.dp)) }
            }
            TabItem(Icons.Outlined.Handshake, "Deudas", tab == Tab.DEBTS, Modifier.weight(1f)) { onTab(Tab.DEBTS) }
            TabItem(Icons.Outlined.Insights, "Análisis", tab == Tab.ANALYSIS, Modifier.weight(1f)) { onTab(Tab.ANALYSIS) }
        }
    }
}

@Composable
private fun TabItem(icon: ImageVector, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = Eco.colors
    val color = if (selected) c.accent else c.muted
    Column(
        modifier.fillMaxSize().clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(24.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = color)
    }
}
