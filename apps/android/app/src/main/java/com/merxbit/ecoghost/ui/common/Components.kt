package com.merxbit.ecoghost.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.merxbit.ecoghost.data.Money
import com.merxbit.ecoghost.data.Movement
import com.merxbit.ecoghost.ui.theme.Eco
import com.merxbit.ecoghost.ui.theme.EcoShape

/** Los iconos de categoría vienen con nombres de Ant Design (los usa la web). */
fun categoryIcon(name: String?): ImageVector = when (name) {
    "wallet" -> Icons.Outlined.AccountBalanceWallet
    "shop" -> Icons.Outlined.Storefront
    "laptop" -> Icons.Outlined.Laptop
    "stock" -> Icons.Outlined.ShowChart
    "plus-circle" -> Icons.Outlined.AddCircleOutline
    "home" -> Icons.Outlined.Home
    "thunderbolt" -> Icons.Outlined.Bolt
    "tool" -> Icons.Outlined.Build
    "build" -> Icons.Outlined.Construction
    "shopping-cart" -> Icons.Outlined.ShoppingCart
    "coffee" -> Icons.Outlined.LocalCafe
    "car" -> Icons.Outlined.DirectionsCar
    "fire" -> Icons.Outlined.LocalGasStation
    "swap" -> Icons.Outlined.DirectionsBus
    "read" -> Icons.Outlined.School
    "heart" -> Icons.Outlined.FavoriteBorder
    "skin" -> Icons.Outlined.Checkroom
    "smile" -> Icons.Outlined.SentimentSatisfied
    "wifi" -> Icons.Outlined.Wifi
    "phone" -> Icons.Outlined.PhoneAndroid
    "desktop" -> Icons.Outlined.DesktopWindows
    "code" -> Icons.Outlined.Code
    "bank" -> Icons.Outlined.AccountBalance
    "transaction" -> Icons.Outlined.Handshake
    "gift" -> Icons.Outlined.CardGiftcard
    "medicine-box" -> Icons.Outlined.MedicalServices
    "credit-card" -> Icons.Outlined.CreditCard
    "dollar" -> Icons.Outlined.AttachMoney
    "team" -> Icons.Outlined.Groups
    "ellipsis" -> Icons.Outlined.MoreHoriz
    else -> Icons.Outlined.Category
}

fun accountIcon(type: String): ImageVector = when (type) {
    "CASH" -> Icons.Outlined.Payments
    "BANK" -> Icons.Outlined.AccountBalance
    "DIGITAL" -> Icons.Outlined.CreditCard
    else -> Icons.Outlined.AccountBalanceWallet
}

fun parseColor(hex: String?): Color? = runCatching {
    hex?.removePrefix("#")?.takeIf { it.length == 6 }?.let { Color(("FF$it").toLong(16)) }
}.getOrNull()

/** Importe con la moneda pequeña al lado, como en el prototipo. */
@Composable
fun AmountText(
    cents: Long,
    currency: String?,
    modifier: Modifier = Modifier,
    prefix: String = "",
    color: Color = Eco.colors.text,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.titleSmall,
    currencySize: TextUnit = style.fontSize * 0.72f,
) {
    Text(
        buildAnnotatedString {
            append(prefix + Money.format(cents))
            if (!currency.isNullOrEmpty()) {
                withStyle(SpanStyle(fontSize = currencySize, fontWeight = FontWeight.SemiBold, color = color.copy(alpha = 0.7f))) {
                    append(" $currency")
                }
            }
        },
        modifier = modifier,
        style = style,
        color = color,
        maxLines = 1,
    )
}

@Composable
fun EcoCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier
            .background(Eco.colors.surface, EcoShape.card)
            .border(1.dp, Eco.colors.line, EcoShape.card)
            .padding(14.dp),
    ) { content() }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
    Row(modifier.padding(top = 20.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = Eco.colors.muted, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

@Composable
fun CategoryBadge(icon: ImageVector, color: Color, size: Int = 38) {
    Box(
        Modifier.size(size.dp).background(color.copy(alpha = 0.14f), EcoShape.card),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = color, modifier = Modifier.size((size * 0.55).dp)) }
}

@Composable
fun Avatar(name: String, size: Int = 34) {
    val initials = name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    Box(
        Modifier.size(size.dp).background(Eco.colors.accentSoft, CircleShape),
        contentAlignment = Alignment.Center,
    ) { Text(initials, style = MaterialTheme.typography.labelMedium, color = Eco.colors.accent) }
}

/** Fila de movimiento (igual que txRow del prototipo). */
@Composable
fun MovementRow(m: Movement, modifier: Modifier = Modifier) {
    val c = Eco.colors
    val (icon, color) = when (m.type) {
        "TRANSFER" -> Icons.Outlined.SwapHoriz to c.muted
        "EXCHANGE" -> Icons.Outlined.CurrencyExchange to c.muted
        else -> categoryIcon(m.categoryIcon) to (parseColor(m.categoryColor) ?: c.muted)
    }
    val sub = buildString {
        append(m.accountName)
        append(" · ")
        when (m.type) {
            "TRANSFER", "EXCHANGE" -> append("→ ${m.toAccountName ?: "otra cuenta"}")
            else -> append(m.categoryName ?: "Sin categoría")
        }
        if (m.viaTelegram) append(" · Telegram")
        when (m.status) {
            "PENDING" -> append(" · por aprobar")
            "REJECTED" -> append(" · rechazado")
        }
    }
    Row(modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        CategoryBadge(icon, color)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(m.description, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End) {
            when (m.type) {
                "INCOME" -> AmountText(m.amount, m.currency, prefix = "+", color = c.income)
                "EXPENSE" -> AmountText(m.amount, m.currency, prefix = "−")
                else -> AmountText(m.amount, m.currency, color = c.muted)
            }
            if (m.type == "EXCHANGE" && m.toAmount != null) {
                AmountText(m.toAmount, m.toCurrency, prefix = "+", color = c.muted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
