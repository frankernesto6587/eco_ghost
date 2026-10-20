package com.merxbit.ecoghost.ui

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import com.merxbit.ecoghost.data.Account
import com.merxbit.ecoghost.data.EntryData
import com.merxbit.ecoghost.data.EntryRepository
import com.merxbit.ecoghost.data.EntryType
import com.merxbit.ecoghost.data.Home
import com.merxbit.ecoghost.data.Movement
import com.merxbit.ecoghost.data.net.CategoryNodeDto
import com.merxbit.ecoghost.data.net.OrgDto
import com.merxbit.ecoghost.ui.entry.EntryContent
import com.merxbit.ecoghost.ui.entry.EntryForm
import com.merxbit.ecoghost.ui.home.HomeContent
import com.merxbit.ecoghost.ui.login.LoginContent
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoTheme
import com.merxbit.ecoghost.ui.theme.ThemeMode
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDate

/**
 * Capturas de las pantallas en la JVM (sin emulador), en claro y oscuro.
 * Salen en app/build/outputs/roborazzi/. Sirven para revisar el diseño y para
 * cazar crashes de UI antes de publicar.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], application = Application::class, qualifiers = "w400dp-h880dp-xxhdpi")
class ScreensTest {
    @get:Rule val compose = createComposeRule()

    private val org = OrgDto("o1", "Casa (prueba)", "MN", "OWNER")
    private val today = LocalDate.now()
    private val home = Home(
        baseCurrency = "MN",
        totals = mapOf("MN" to 18_120_100, "USD" to 243_291, "MLC" to 33_000),
        accounts = listOf(
            Account("1", "BANDEC", "BANK", "MN", 15_776_300),
            Account("2", "Efectivo MN", "CASH", "MN", 2_343_800),
            Account("3", "Zelle", "DIGITAL", "USD", 186_291),
            Account("4", "Efectivo USD", "CASH", "USD", 57_000),
        ),
        monthIncome = 4_500_000, monthExpense = 4_519_900,
        receivable = mapOf("USD" to 25_000), payable = mapOf("MN" to 4_500_000),
        recent = listOf(
            Movement("a", today, "Agro", "EXPENSE", 640_000, "MN", "Efectivo MN", "Mercado", "shopping-cart", "#fa7c20"),
            Movement("b", today, "Salario", "INCOME", 4_500_000, "MN", "BANDEC", "Salario", "wallet", "#5ac576"),
            Movement("c", today.minusDays(1), "Cambio USD a MN", "EXCHANGE", 10_000, "USD", "Efectivo USD", null, null, null, "Efectivo MN", 3_800_000, "MN"),
            Movement("d", today.minusDays(1), "Extraccion cajero", "TRANSFER", 3_500_000, "MN", "BANDEC", null, null, null, "Efectivo MN"),
            Movement("e", today.minusDays(2), "Paquete combo", "EXPENSE", 6_245, "USD", "Zelle", "Delivery", "car", "#fa7c20", viaTelegram = true),
        ),
    )

    private val entryData = EntryData(
        accounts = home.accounts,
        groups = EntryRepository.groups(
            listOf(
                CategoryNodeDto("ali", "Alimentacion", "coffee", "#fa7c20", children = listOf(
                    CategoryNodeDto("mer", "Mercado"), CategoryNodeDto("del", "Delivery"), CategoryNodeDto("res", "Restaurantes"),
                )),
                CategoryNodeDto("tra", "Transporte", "car", "#c97adb", children = listOf(CategoryNodeDto("com", "Combustible"))),
                CategoryNodeDto("viv", "Vivienda", "home", "#6d95ee", children = listOf(CategoryNodeDto("cons", "Construccion"))),
            ),
        ),
        usage = mapOf(EntryType.EXPENSE to listOf("mer", "cons", "del", "com", "res")),
        preferredAccountId = "2",
    )

    @Composable
    private fun entry(form: EntryForm, error: String? = null) =
        EntryContent(form, entryData, false, error, null, {}, {}, {}, {})

    private fun shot(name: String, mode: ThemeMode, content: @Composable () -> Unit) {
        compose.setContent {
            EcoTheme(mode) { Box(Modifier.fillMaxSize().background(Eco.colors.bg)) { content() } }
        }
        compose.onRoot().captureRoboImage("build/outputs/roborazzi/$name.png")
    }

    @Test fun loginClaro() = shot("login-claro", ThemeMode.LIGHT) { LoginContent(false, null, { _, _ -> }, {}) }
    @Test fun loginOscuro() = shot("login-oscuro", ThemeMode.DARK) { LoginContent(false, "Correo o contraseña incorrectos", { _, _ -> }, {}) }
    @Test fun inicioClaro() = shot("inicio-claro", ThemeMode.LIGHT) { HomeContent(org, "Frank", home, null, false, {}) }
    @Test fun inicioOscuro() = shot("inicio-oscuro", ThemeMode.DARK) { HomeContent(org, "Frank", home, null, false, {}) }
    @Test fun anotarGastoClaro() = shot("anotar-gasto-claro", ThemeMode.LIGHT) {
        entry(EntryForm(amount = "6400", accountId = "2", categoryId = "mer", description = "Agro"))
    }
    @Test fun anotarCambioOscuro() = shot("anotar-cambio-oscuro", ThemeMode.DARK) {
        entry(EntryForm(type = EntryType.TRANSFER, amount = "100", toAmount = "38000", typingTo = true, accountId = "4", toAccountId = "2"))
    }
    @Test fun anotarVacioOscuro() = shot("anotar-vacio-oscuro", ThemeMode.DARK) {
        entry(EntryForm(accountId = "2"), error = "Escribe el importe")
    }
    @Test fun inicioSinConexion() = shot("inicio-sin-conexion", ThemeMode.LIGHT) { HomeContent(org, "Frank", null, "Sin conexión con el servidor", false, {}) }
}
