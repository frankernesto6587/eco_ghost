package com.merxbit.ecoghost.data

import com.merxbit.ecoghost.data.net.ApiJson
import com.merxbit.ecoghost.data.net.EcoApi
import com.merxbit.ecoghost.data.net.LoginRequest
import com.merxbit.ecoghost.data.net.OrgDto
import com.merxbit.ecoghost.data.net.RefreshRequest
import com.merxbit.ecoghost.data.net.SessionEvents
import com.merxbit.ecoghost.data.net.UserDto
import com.merxbit.ecoghost.data.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface Session {
    /** Arrancando: hay tokens guardados y se está comprobando la sesión. */
    data object Loading : Session
    data object LoggedOut : Session
    /** Hay tokens pero no se pudo contactar con la API. */
    data class Offline(val message: String) : Session
    data class LoggedIn(val user: UserDto, val orgs: List<OrgDto>, val org: OrgDto?) : Session
}

@Singleton
class AuthRepository @Inject constructor(
    private val api: EcoApi,
    private val store: SessionStore,
    events: SessionEvents,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _session = MutableStateFlow<Session>(if (store.tokens == null) Session.LoggedOut else Session.Loading)
    val session: StateFlow<Session> = _session

    init {
        scope.launch { events.expired.collect { _session.value = Session.LoggedOut } }
        if (store.tokens != null) scope.launch { restore() }
    }

    suspend fun restore() {
        _session.value = Session.Loading
        runCatching { api.me() }
            .onSuccess { open(it.user, it.organizations) }
            .onFailure { e ->
                _session.value = if (e is HttpException && e.code() == 401) {
                    store.clear(); Session.LoggedOut
                } else Session.Offline(errorMessage(e))
            }
    }

    /** Devuelve un mensaje de error para la pantalla, o null si entró. */
    suspend fun login(email: String, password: String): String? = runCatching {
        val r = api.login(LoginRequest(email.trim(), password))
        store.saveTokens(r.tokens)
        open(r.user, r.organizations)
    }.exceptionOrNull()?.let(::errorMessage)

    private suspend fun open(user: UserDto, orgs: List<OrgDto>) {
        // La última organización usada, o la única que haya
        val org = orgs.firstOrNull { it.id == store.orgId } ?: orgs.singleOrNull()
        org?.let { store.setOrg(it.id) }
        _session.value = Session.LoggedIn(user, orgs, org)
    }

    suspend fun selectOrg(org: OrgDto) {
        store.setOrg(org.id)
        val s = _session.value as? Session.LoggedIn ?: return
        _session.value = s.copy(org = org)
    }

    suspend fun logout() {
        store.tokens?.let { t -> runCatching { api.logout(RefreshRequest(t.refreshToken)) } }
        store.clear()
        _session.value = Session.LoggedOut
    }
}

fun errorMessage(e: Throwable): String = when {
    e is HttpException && e.code() == 401 -> "Correo o contraseña incorrectos"
    e is HttpException && e.code() == 429 -> "Demasiados intentos. Espera un minuto."
    e is HttpException && e.code() == 403 -> "Tu rol en esta organización no permite hacerlo"
    e is HttpException && e.code() == 400 -> apiMessage(e) ?: "Revisa los datos e inténtalo de nuevo"
    e is HttpException -> "El servidor respondió ${e.code()}. Inténtalo de nuevo."
    e is java.io.IOException -> "Sin conexión con el servidor"
    else -> "Algo salió mal: ${e.message ?: e.javaClass.simpleName}"
}

/** El mensaje de validación de NestJS: {"message": "..."} o {"message": ["...", ...]}. */
private fun apiMessage(e: HttpException): String? = runCatching {
    val body = e.response()?.errorBody()?.string() ?: return null
    val msg = (ApiJson.parseToJsonElement(body) as JsonObject)["message"] ?: return null
    when (msg) {
        is JsonArray -> msg.joinToString(". ") { (it as JsonPrimitive).content }
        is JsonPrimitive -> msg.content
        else -> null
    }
}.getOrNull()
