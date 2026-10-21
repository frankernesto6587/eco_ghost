package com.merxbit.ecoghost.data

import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class GoogleTest {
    @Test fun `cerrar el selector de cuentas no es un error`() {
        assertEquals(GoogleResult.Cancelled, credentialFailure(GetCredentialCancellationException()))
    }

    @Test fun `sin cuentas o con la consola mal configurada se explica`() {
        assertEquals(
            GoogleResult.Failed("No hay ninguna cuenta de Google en este teléfono"),
            credentialFailure(NoCredentialException()),
        )
        assertEquals(
            GoogleResult.Failed("Google no dejó entrar: [28444] Developer console is not set up correctly."),
            credentialFailure(GetCredentialUnknownException("[28444] Developer console is not set up correctly.")),
        )
    }

    @Test fun `con Google un 401 no habla de contraseña`() {
        val e401 = HttpException(Response.error<Any>(401, "".toResponseBody()))
        assertEquals("La cuenta de Google no se pudo validar. Inténtalo de nuevo.", googleErrorMessage(e401))
        assertEquals("Correo o contraseña incorrectos", errorMessage(e401))
    }
}
