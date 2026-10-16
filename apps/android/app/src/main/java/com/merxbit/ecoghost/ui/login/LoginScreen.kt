package com.merxbit.ecoghost.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merxbit.ecoghost.BuildConfig
import com.merxbit.ecoghost.R
import com.merxbit.ecoghost.data.AuthRepository
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) { error = "Escribe tu correo y tu contraseña"; return }
        loading = true; error = null
        viewModelScope.launch {
            error = auth.login(email, password)
            loading = false
        }
    }

    fun googleNotReady() { error = "Entrar con Google llega en la próxima versión" }
}

@Composable
fun LoginScreen(vm: LoginViewModel = hiltViewModel()) {
    LoginContent(vm.loading, vm.error, vm::login, vm::googleNotReady)
}

@Composable
fun LoginContent(loading: Boolean, error: String?, onLogin: (String, String) -> Unit, onGoogle: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val c = Eco.colors
    val fieldColors = OutlinedTextFieldDefaults.colors(
        unfocusedBorderColor = c.line, focusedBorderColor = c.accent,
        unfocusedContainerColor = c.surface, focusedContainerColor = c.surface,
    )

    Column(
        Modifier.fillMaxSize().background(c.bg).systemBarsPadding().imePadding()
            .verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(56.dp))
        Box(Modifier.size(64.dp).background(c.accent, EcoShape.fab), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ic_launcher_foreground), null, tint = c.onAccent, modifier = Modifier.size(64.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("EcoGhost", style = MaterialTheme.typography.headlineMedium)
            Text("Tus finanzas, sin partida doble", style = MaterialTheme.typography.bodyMedium, color = c.muted)
            if (BuildConfig.FLAVOR == "prueba") {
                Text("Entorno de pruebas", style = MaterialTheme.typography.labelMedium, color = c.warning)
            }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            email, { email = it }, Modifier.fillMaxWidth(),
            label = { Text("Correo") }, singleLine = true, shape = EcoShape.field, colors = fieldColors,
            leadingIcon = { Icon(Icons.Outlined.Mail, null) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            pass, { pass = it }, Modifier.fillMaxWidth(),
            label = { Text("Contraseña") }, singleLine = true, shape = EcoShape.field, colors = fieldColors,
            leadingIcon = { Icon(Icons.Outlined.Lock, null) },
            trailingIcon = {
                IconButton({ show = !show }) {
                    Icon(if (show) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, if (show) "Ocultar" else "Mostrar")
                }
            },
            visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); onLogin(email, pass) }),
        )
        error?.let { Text(it, color = c.danger, style = MaterialTheme.typography.bodyMedium) }
        Button(
            { focus.clearFocus(); onLogin(email, pass) },
            Modifier.fillMaxWidth().height(50.dp), enabled = !loading, shape = EcoShape.field,
            colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.onAccent),
        ) {
            if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = c.onAccent, strokeWidth = 2.dp)
            else Text("Entrar", style = MaterialTheme.typography.labelLarge)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            HorizontalDivider(Modifier.weight(1f), color = c.line)
            Text("  o  ", color = c.muted, style = MaterialTheme.typography.bodySmall)
            HorizontalDivider(Modifier.weight(1f), color = c.line)
        }
        OutlinedButton(
            onGoogle, Modifier.fillMaxWidth().height(50.dp), shape = EcoShape.field,
            border = androidx.compose.foundation.BorderStroke(1.dp, c.line),
        ) {
            Icon(Icons.Outlined.AccountCircle, null, tint = c.text)
            Spacer(Modifier.size(8.dp))
            Text("Continuar con Google", color = c.text, style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.height(24.dp))
    }
}
