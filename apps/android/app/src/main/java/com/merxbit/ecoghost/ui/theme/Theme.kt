package com.merxbit.ecoghost.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.merxbit.ecoghost.R

/** Colores propios de EcoGhost que Material 3 no tiene (ingreso, aviso, línea...). */
@Immutable
data class EcoColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val text: Color,
    val muted: Color,
    val line: Color,
    val accent: Color,
    val onAccent: Color,
    val accentSoft: Color,
    val income: Color,
    val warning: Color,
    val danger: Color,
    /** El saldo grande de Inicio: texto en Alucard, acento morado en Dracula. */
    val hero: Color,
)

// Mismos colores que la web (draculatheme.com/spec): claro = Alucard, oscuro = Dracula.
// Fondo = "Background Dark/Lighter", tarjetas = "Background", texto apagado entre Foreground y Comment.

// Tema claro "Alucard"
val Alucard = EcoColors(
    bg = Color(0xFFECE9DF), surface = Color(0xFFFFFBEB), surface2 = Color(0xFFEFEDDC),
    text = Color(0xFF1F1F1F), muted = Color(0xFF6C664B), line = Color(0xFFCECCC0),
    accent = Color(0xFF644AC9), onAccent = Color(0xFFFFFBEB), accentSoft = Color(0xFFE5DEF2),
    income = Color(0xFF14710A), warning = Color(0xFFA34D14), danger = Color(0xFFCB3A2A),
    hero = Color(0xFF1F1F1F),
)

// Tema oscuro "Dracula"
val Dracula = EcoColors(
    bg = Color(0xFF21222C), surface = Color(0xFF282A36), surface2 = Color(0xFF343746),
    text = Color(0xFFF8F8F2), muted = Color(0xFF9AA3CC), line = Color(0xFF44475A),
    accent = Color(0xFFBD93F9), onAccent = Color(0xFF282A36), accentSoft = Color(0xFF403B55),
    income = Color(0xFF50FA7B), warning = Color(0xFFFFB86C), danger = Color(0xFFFF5555),
    hero = Color(0xFFBD93F9),
)

val LocalEco = staticCompositionLocalOf { Alucard }

@OptIn(ExperimentalTextApi::class)
private fun manrope(weight: Int) = Font(
    R.font.manrope,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val Manrope = FontFamily(manrope(400), manrope(500), manrope(600), manrope(700), manrope(800))

private fun style(size: Int, weight: Int, line: Int = (size * 1.35).toInt(), spacing: Double = 0.0) = TextStyle(
    fontFamily = Manrope,
    fontWeight = FontWeight(weight),
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = spacing.sp,
    // Cifras tabulares para que los importes se alineen
    fontFeatureSettings = "tnum",
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
)

private val EcoTypography = Typography(
    displayLarge = style(38, 800, 44, -0.8),
    headlineMedium = style(24, 800, 30, -0.3),
    titleLarge = style(20, 800, 26),
    titleMedium = style(16, 700, 22),
    titleSmall = style(14, 700, 20),
    bodyLarge = style(16, 500, 23),
    bodyMedium = style(14, 500, 20),
    bodySmall = style(12, 500, 16),
    labelLarge = style(14, 700, 20),
    labelMedium = style(12, 600, 16, 0.2),
    labelSmall = style(11, 700, 14, 0.6),
)

// Esquinas casi rectas (decisión de Frank): 4 tarjetas, 3 campos y botones
object EcoShape {
    val card = RoundedCornerShape(4.dp)
    val field = RoundedCornerShape(3.dp)
    val fab = RoundedCornerShape(6.dp)
    val sheet = RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp)
}

private val EcoShapes = Shapes(
    extraSmall = RoundedCornerShape(3.dp),
    small = RoundedCornerShape(3.dp),
    medium = RoundedCornerShape(4.dp),
    large = RoundedCornerShape(4.dp),
    extraLarge = RoundedCornerShape(8.dp),
)

private fun EcoColors.toMaterial(dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = accent, onPrimary = onAccent, primaryContainer = accentSoft, onPrimaryContainer = text,
        secondary = accent, onSecondary = onAccent, secondaryContainer = accentSoft, onSecondaryContainer = text,
        background = bg, onBackground = text,
        surface = surface, onSurface = text, surfaceVariant = surface2, onSurfaceVariant = muted,
        surfaceContainer = surface, surfaceContainerLow = surface, surfaceContainerHigh = surface,
        surfaceContainerHighest = surface2, surfaceContainerLowest = surface,
        outline = line, outlineVariant = line,
        error = danger, onError = onAccent,
    )
}

enum class ThemeMode { SYSTEM, LIGHT, DARK }

@Composable
fun EcoTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val eco = if (dark) Dracula else Alucard
    CompositionLocalProvider(LocalEco provides eco) {
        MaterialTheme(
            colorScheme = eco.toMaterial(dark),
            typography = EcoTypography,
            shapes = EcoShapes,
        ) {
            // Texto e iconos sin color explícito toman el del tema (si no, salen negros en Dracula)
            CompositionLocalProvider(LocalContentColor provides eco.text, content = content)
        }
    }
}

object Eco {
    val colors: EcoColors @Composable get() = LocalEco.current
}
