package com.merxbit.ecoghost

import android.app.Application
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.merxbit.ecoghost.data.AuthRepository
import com.merxbit.ecoghost.data.Session
import com.merxbit.ecoghost.data.session.SessionStore
import com.merxbit.ecoghost.ui.AppRoot
import com.merxbit.ecoghost.ui.theme.EcoTheme
import com.merxbit.ecoghost.ui.theme.ThemeMode
import com.merxbit.ecoghost.update.UpdatePrompt
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.HiltAndroidApp
import okhttp3.OkHttpClient
import javax.inject.Inject

@HiltAndroidApp
class EcoApp : Application()

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var auth: AuthRepository
    @Inject lateinit var store: SessionStore
    @Inject lateinit var client: OkHttpClient

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // El splash se queda hasta saber si hay sesión
        splash.setKeepOnScreenCondition { auth.session.value == Session.Loading }

        setContent {
            val mode by store.themeMode.collectAsState(ThemeMode.SYSTEM)
            val dark = when (mode) {
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
            }
            DisposableEffect(dark) {
                val style = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                onDispose { }
            }
            EcoTheme(mode) {
                AppRoot(auth, store, mode)
                UpdatePrompt(client)
            }
        }
    }
}
