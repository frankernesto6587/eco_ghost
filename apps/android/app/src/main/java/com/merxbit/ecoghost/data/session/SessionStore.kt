package com.merxbit.ecoghost.data.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.merxbit.ecoghost.data.net.Tokens
import com.merxbit.ecoghost.ui.theme.ThemeMode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore("session")

/**
 * Sesión: tokens cifrados con una clave del Android Keystore (no sale del
 * dispositivo) y preferencias normales (organización activa, tema).
 * Los tokens se cachean en memoria porque el interceptor los lee en cada petición.
 */
@Singleton
class SessionStore @Inject constructor(@ApplicationContext private val ctx: Context) {
    private val kAccess = stringPreferencesKey("access")
    private val kRefresh = stringPreferencesKey("refresh")
    private val kOrg = stringPreferencesKey("org")
    private val kTheme = stringPreferencesKey("theme")

    @Volatile private var cache: Tokens? = null
    @Volatile private var orgCache: String? = null

    init {
        // Una sola lectura al arrancar; después todo sale de la caché en memoria
        runBlocking {
            val p = ctx.dataStore.data.first()
            val a = p[kAccess]?.let(::decrypt)
            val r = p[kRefresh]?.let(::decrypt)
            cache = if (a != null && r != null) Tokens(a, r) else null
            orgCache = p[kOrg]
        }
    }

    val tokens: Tokens? get() = cache
    val orgId: String? get() = orgCache

    val themeMode: Flow<ThemeMode> = ctx.dataStore.data.map { p ->
        p[kTheme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM
    }

    suspend fun saveTokens(t: Tokens) {
        cache = t
        ctx.dataStore.edit {
            it[kAccess] = encrypt(t.accessToken)
            it[kRefresh] = encrypt(t.refreshToken)
        }
    }

    suspend fun setOrg(id: String) {
        orgCache = id
        ctx.dataStore.edit { it[kOrg] = id }
    }

    /** Última cuenta usada al anotar, por organización (la hoja la preselecciona). */
    suspend fun lastAccount(orgId: String): String? = ctx.dataStore.data.first()[lastAccountKey(orgId)]

    suspend fun setLastAccount(orgId: String, accountId: String) {
        ctx.dataStore.edit { it[lastAccountKey(orgId)] = accountId }
    }

    private fun lastAccountKey(orgId: String) = stringPreferencesKey("last_account_$orgId")

    suspend fun setTheme(mode: ThemeMode) {
        ctx.dataStore.edit { it[kTheme] = mode.name }
    }

    suspend fun clear() {
        cache = null
        orgCache = null
        ctx.dataStore.edit {
            it.remove(kAccess)
            it.remove(kRefresh)
            it.remove(kOrg)
        }
    }

    // ─── Cifrado AES-GCM con clave del Keystore ───────────────────────

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        val c = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = c.iv + c.doFinal(plain.toByteArray())
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    /** null si no se puede descifrar (p. ej. la clave se perdió al restaurar el móvil). */
    private fun decrypt(enc: String): String? = runCatching {
        val raw = Base64.decode(enc, Base64.NO_WRAP)
        val c = Cipher.getInstance(TRANSFORM)
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw, 0, 12))
        String(c.doFinal(raw, 12, raw.size - 12))
    }.getOrNull()

    private companion object {
        const val ALIAS = "ecoghost-session"
        const val TRANSFORM = "AES/GCM/NoPadding"
    }
}
