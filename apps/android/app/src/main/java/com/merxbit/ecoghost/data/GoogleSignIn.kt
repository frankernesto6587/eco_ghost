package com.merxbit.ecoghost.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.merxbit.ecoghost.BuildConfig

/** Lo que sale del selector de cuentas de Google. */
sealed interface GoogleResult {
    data class Token(val idToken: String) : GoogleResult
    /** Lo cerró el usuario: no es un error. */
    data object Cancelled : GoogleResult
    data class Failed(val message: String) : GoogleResult
}

object GoogleSignIn {
    /** Abre el selector de cuentas. Necesita la Activity, no el contexto de la aplicación. */
    suspend fun pick(activity: Context): GoogleResult {
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build())
            .build()
        return try {
            val credential = CredentialManager.create(activity).getCredential(activity, request).credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else GoogleResult.Failed("Google no devolvió ninguna cuenta")
        } catch (e: GetCredentialException) {
            credentialFailure(e)
        } catch (e: GoogleIdTokenParsingException) {
            GoogleResult.Failed("Google devolvió una respuesta que no se entiende")
        }
    }
}

fun credentialFailure(e: GetCredentialException): GoogleResult = when (e) {
    is GetCredentialCancellationException -> GoogleResult.Cancelled
    is NoCredentialException -> GoogleResult.Failed("No hay ninguna cuenta de Google en este teléfono")
    // El detalle ayuda a saber qué pasó, p. ej. si falta el cliente Android en la consola
    else -> GoogleResult.Failed("Google no dejó entrar: ${e.errorMessage ?: e.type}")
}
