package com.merxbit.ecoghost.data.net

import com.merxbit.ecoghost.BuildConfig
import com.merxbit.ecoghost.data.session.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

val ApiJson = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

/** Avisa a la UI cuando la sesión caduca y no se pudo refrescar. */
@Singleton
class SessionEvents @Inject constructor() {
    private val _expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val expired: SharedFlow<Unit> = _expired
    fun notifyExpired() { _expired.tryEmit(Unit) }
}

/** Añade Authorization y X-Organization-Id a cada petición. */
class AuthInterceptor(private val session: SessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val b = chain.request().newBuilder()
        session.tokens?.let { b.header("Authorization", "Bearer ${it.accessToken}") }
        session.orgId?.let { b.header("X-Organization-Id", it) }
        return chain.proceed(b.build())
    }
}

/**
 * Al recibir 401 refresca el token una sola vez aunque fallen varias peticiones
 * a la vez (el refresh token rota: dos refrescos simultáneos invalidarían la sesión).
 */
class TokenAuthenticator(
    private val session: SessionStore,
    private val refreshApi: () -> EcoApi,
    private val events: SessionEvents,
) : Authenticator {
    private val mutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.endsWith("/auth/refresh")) return null
        if (responseCount(response) >= 2) return null
        val failedWith = response.request.header("Authorization")?.removePrefix("Bearer ")

        val fresh = runBlocking {
            mutex.withLock {
                val current = session.tokens ?: return@withLock null
                // Otra petición ya lo refrescó mientras esperábamos
                if (current.accessToken != failedWith) return@withLock current
                runCatching { refreshApi().refresh(RefreshRequest(current.refreshToken)) }
                    .onSuccess { session.saveTokens(it) }
                    .onFailure {
                        session.clear()
                        events.notifyExpired()
                    }
                    .getOrNull()
            }
        } ?: return null

        return response.request.newBuilder().header("Authorization", "Bearer ${fresh.accessToken}").build()
    }

    private fun responseCount(r: Response): Int {
        var n = 1
        var p = r.priorResponse
        while (p != null) { n++; p = p.priorResponse }
        return n
    }
}

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    private fun retrofit(client: OkHttpClient) = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(ApiJson.asConverterFactory("application/json".toMediaType()))
        .build()

    /** Cliente sin autenticación: manifiesto del actualizador y refresh. */
    @Provides @Singleton
    fun plainClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    @Provides @Singleton
    fun api(plain: OkHttpClient, session: SessionStore, events: SessionEvents): EcoApi {
        val refreshApi by lazy { retrofit(plain).create(EcoApi::class.java) }
        val client = plain.newBuilder()
            .addInterceptor(AuthInterceptor(session))
            .authenticator(TokenAuthenticator(session, { refreshApi }, events))
            .build()
        return retrofit(client).create(EcoApi::class.java)
    }
}
