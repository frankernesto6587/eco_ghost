package com.merxbit.ecoghost.data.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// DTOs de la API (a mano por ahora; S1 prevé generarlos desde el OpenAPI).
// Importes en centavos. Nunca se usan directamente en la UI sin pasar por el repositorio.

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

/** ID token de Google (Credential Manager) para POST /auth/google/mobile. */
@Serializable
data class GoogleMobileRequest(val idToken: String)

@Serializable
data class Tokens(val accessToken: String, val refreshToken: String)

@Serializable
data class UserDto(val id: String, val email: String, val name: String, val avatarUrl: String? = null)

@Serializable
data class OrgDto(
    val id: String,
    val name: String,
    val baseCurrency: String = "USD",
    val role: String,
)

@Serializable
data class AuthResponse(val user: UserDto, val tokens: Tokens, val organizations: List<OrgDto>)

@Serializable
data class MeResponse(val user: UserDto, val organizations: List<OrgDto>)

@Serializable
data class AccountBalanceDto(val id: String, val name: String, val currency: String, val balance: Long)

@Serializable
data class AccountDto(
    val id: String,
    val name: String,
    val type: String,
    val currency: String,
    val isActive: Boolean = true,
    /** Lo que moveria lo pendiente de aprobar que el usuario puede ver (no esta en el saldo). */
    val pendingDelta: Long = 0,
    val pendingCount: Int = 0,
)

@Serializable
data class OverviewDto(
    val totalBalance: Map<String, Long> = emptyMap(),
    val accountBalances: List<AccountBalanceDto> = emptyList(),
    val monthIncome: Map<String, Long> = emptyMap(),
    val monthExpense: Map<String, Long> = emptyMap(),
    val pendingDebtsReceivable: Map<String, Long> = emptyMap(),
    val pendingDebtsPayable: Map<String, Long> = emptyMap(),
    val pending: ApprovalCountsDto = ApprovalCountsDto(),
    /** El mes en la moneda de estadisticas (a mercado + diferencias de cambio); null si no esta activo. */
    val report: ReportDto? = null,
)

@Serializable
data class PatrimonyTotalsDto(
    val atCost: Long? = null,
    val atToday: Long? = null,
    val unrealized: Long? = null,
    val unrealizedExchange: Long? = null,
    val unrealizedHolding: Long? = null,
)

@Serializable
data class ReportDto(
    val currency: String,
    val monthIncome: Long = 0,
    val monthExpense: Long = 0,
    /** Ingresos - gastos + diferencias de cambio: cuadra con el coste real. */
    val net: Long = 0,
    /** Diferencias de cambio (a favor > 0) = por cambio + por retener. */
    val fxResult: Long = 0,
    val fxExchange: Long = 0,
    val fxHolding: Long = 0,
    val incomplete: Int = 0,
    val estimates: Int = 0,
    val patrimony: PatrimonyTotalsDto = PatrimonyTotalsDto(),
)

@Serializable
data class MineCountsDto(val pending: Int = 0, val rejected: Int = 0)

/** Aprobaciones: lo que espera revision (para quien aprueba) y lo propio. */
@Serializable
data class ApprovalCountsDto(
    val toReview: Int = 0,
    val mine: MineCountsDto = MineCountsDto(),
    val unreadNotifications: Int = 0,
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val parentId: String? = null,
    /** Saldo inicial, correcciones: mueven saldo pero no son gasto ni ingreso. */
    val isAdjustment: Boolean = false,
)

@Serializable
data class TransactionDto(
    val id: String,
    val date: String,
    val description: String,
    val amount: Long,
    val type: String,
    val accountId: String,
    val linkedTransactionId: String? = null,
    val source: String? = null,
    /** Solo APPROVED cuenta en saldos. */
    val status: String = "APPROVED",
    val rejectionReason: String? = null,
    /** Coste FIFO en la moneda de estadisticas (centavos), si la valoracion esta activa. */
    val reportAmount: Long? = null,
    /** A la tasa de mercado de su dia: lo que se muestra como "≈ USD". */
    val marketAmount: Long? = null,
    val valuationStatus: String? = null,
    val category: CategoryDto? = null,
    val account: AccountDto? = null,
    // Lo que trae GET /transactions/:id (el detalle); la lista no lo necesita.
    val notes: String? = null,
    val createdAt: String? = null,
    val debtId: String? = null,
    /** En un par: la pierna que entra (si esta es la que sale)... */
    val linkedTransaction: LegDto? = null,
    /** ...o la que sale (si esta es la que entra). */
    val linkedBy: LegDto? = null,
)

/**
 * GET /transactions/summary. Solo lo aprobado, sin deudas ni ajustes, como el
 * Panel. `count`: filas de la lista (un par cuenta una vez).
 */
@Serializable
data class SummaryDto(
    val income: Map<String, Long> = emptyMap(),
    val expense: Map<String, Long> = emptyMap(),
    val count: Int = 0,
    val report: SummaryReportDto? = null,
)

/** Los mismos totales a mercado en la moneda de estadísticas. `incomplete`: sin tasa, no suman. */
@Serializable
data class SummaryReportDto(val currency: String, val income: Long = 0, val expense: Long = 0, val incomplete: Int = 0)

/** La otra pierna de una transferencia o cambio. */
@Serializable
data class LegDto(val id: String, val amount: Long, val accountId: String, val account: AccountDto? = null)

@Serializable
data class Page<T>(val data: List<T>)

/** Un paso del historial de un movimiento (GET /transactions/:id/history). */
@Serializable
data class HistoryEntryDto(
    /** CREATE, UPDATE, APPROVE, REJECT, RESUBMIT, EDIT_PENDING, WITHDRAW, DELETE, RESTORE, BULK_UPDATE... */
    val action: String,
    val at: String,
    val user: NamedDto? = null,
    val source: String? = null,
    val reason: String? = null,
    val changes: List<HistoryChangeDto> = emptyList(),
)

/** Un campo que cambio. Importes en centavos, fechas ISO; cuentas y categorias ya con su nombre. */
@Serializable
data class HistoryChangeDto(
    val field: String,
    val before: JsonPrimitive? = null,
    val after: JsonPrimitive? = null,
    val currency: String? = null,
)

/** De que cambios (lotes) sale el valor en la moneda de estadisticas. Centavos. */
@Serializable
data class BreakdownDto(
    val reportAmount: Long? = null,
    val marketAmount: Long? = null,
    /** EXACT, ESTIMATE o MISSING_RATE. */
    val status: String? = null,
    val fxResult: Long? = null,
    val fxExchange: Long? = null,
    val fxHolding: Long? = null,
    val parts: List<BreakdownPartDto> = emptyList(),
)

@Serializable
data class BreakdownPartDto(val kind: String, val currency: String, val qty: Long, val lot: BreakdownLotDto? = null)

/** origin: EXCHANGE (un cambio), CARRY (cambio entre monedas) o una entrada a tasa del dia. Tasas: unidades por 1 de la moneda de estadisticas. */
@Serializable
data class BreakdownLotDto(val origin: String, val day: String, val description: String? = null, val rate: Double? = null, val marketRate: Double? = null)

@Serializable
data class DeleteRequest(val reason: String)

/** GET /categories devuelve el árbol (raíces con sus hijas). */
@Serializable
data class CategoryNodeDto(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val isAdjustment: Boolean = false,
    /** EXPENSE, INCOME o BOTH: en qué movimientos sale. Sin dato (API vieja), en todos. */
    val kind: String = "BOTH",
    val parentId: String? = null,
    val children: List<CategoryNodeDto> = emptyList(),
)

@Serializable
data class ValuationStatusDto(val enabled: Boolean = false, val reportCurrency: String = "USD")

/** Tasa que rige un dia (MN por unidad): la de ese dia o, si falta, la ultima anterior. */
@Serializable
data class SuggestedRateDto(val value: Double, val day: String, val source: String = "ELTOQUE")

@Serializable
data class RateSuggestionDto(val day: String, val rates: Map<String, SuggestedRateDto> = emptyMap())

@Serializable
data class NamedDto(val id: String, val name: String? = null)

@Serializable
data class ApprovalLegDto(val accountId: String, val accountName: String, val currency: String, val amount: Long)

@Serializable
data class ApprovalDebtDto(val id: String, val personName: String, val type: String, val currency: String)

/** Una entrada de la bandeja: un gasto, un par completo, una deuda o un pago. */
@Serializable
data class ApprovalItemDto(
    val id: String,
    val kind: String,
    val status: String,
    val date: String,
    val description: String,
    val notes: String? = null,
    val source: String? = null,
    val author: NamedDto,
    val submittedAt: String,
    val reviewer: NamedDto? = null,
    val rejectionReason: String? = null,
    val from: ApprovalLegDto,
    val to: ApprovalLegDto? = null,
    val category: CategoryDto? = null,
    val debt: ApprovalDebtDto? = null,
)

@Serializable
data class ApprovalListDto(val data: List<ApprovalItemDto>, val counts: ApprovalCountsDto = ApprovalCountsDto())

/** Correcciones (solo lo que cambia; los nulos no se envian). */
@Serializable
data class EditRequest(
    val description: String? = null,
    val amount: Long? = null,
    val accountId: String? = null,
    val categoryId: String? = null,
    val toAmount: Long? = null,
)

@Serializable
data class ApproveRequest(val edits: EditRequest? = null)

@Serializable
data class RejectRequest(val reason: String)

@Serializable
data class OrgDetailDto(val id: String, val defaultAccountId: String? = null)

/** POST /transactions. TRANSFER y EXCHANGE llevan toAccountId; EXCHANGE además toAmount. */
@Serializable
data class CreateTransactionRequest(
    val date: String,
    val description: String,
    val amount: Long,
    val type: String,
    val accountId: String,
    val categoryId: String? = null,
    val notes: String? = null,
    val toAccountId: String? = null,
    val toAmount: Long? = null,
)

interface EcoApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/google/mobile")
    suspend fun loginWithGoogle(@Body body: GoogleMobileRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Tokens

    @POST("auth/logout")
    suspend fun logout(@Body body: RefreshRequest)

    @GET("auth/me")
    suspend fun me(): MeResponse

    @GET("dashboard/overview")
    suspend fun overview(): OverviewDto

    @GET("accounts")
    suspend fun accounts(): List<AccountDto>

    /** Los filtros que van en null no se envían. Las listas van separadas por comas. */
    @GET("transactions")
    suspend fun transactions(
        @Query("limit") limit: Int = 20,
        @Query("page") page: Int = 1,
        @Query("sortBy") sortBy: String = "date",
        @Query("sortOrder") sortOrder: String = "desc",
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("type") type: String? = null,
        @Query("accountId") accountId: String? = null,
        @Query("categoryId") categoryId: String? = null,
        @Query("status") status: String? = null,
        @Query("search") search: String? = null,
    ): Page<TransactionDto>

    /** Totales de lo que sale con esos filtros (mismas reglas que el Panel). */
    @GET("transactions/summary")
    suspend fun summary(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("type") type: String? = null,
        @Query("accountId") accountId: String? = null,
        @Query("categoryId") categoryId: String? = null,
        @Query("status") status: String? = null,
        @Query("search") search: String? = null,
    ): SummaryDto

    @GET("categories")
    suspend fun categories(): List<CategoryNodeDto>

    @GET("organizations/{id}")
    suspend fun organization(@Path("id") id: String): OrgDetailDto

    @POST("transactions")
    suspend fun createTransaction(@Body body: CreateTransactionRequest): TransactionDto

    @GET("transactions/{id}")
    suspend fun transaction(@Path("id") id: String): TransactionDto

    @GET("transactions/{id}/history")
    suspend fun history(@Path("id") id: String): List<HistoryEntryDto>

    /** Solo los campos que cambian; un null explicito borra (p. ej. la categoria). Propietario y admin. */
    @PATCH("transactions/{id}")
    suspend fun updateTransaction(@Path("id") id: String, @Body body: JsonObject): TransactionDto

    /** A la papelera, con motivo (en un par, las dos piernas). Propietario y admin. */
    @HTTP(method = "DELETE", path = "transactions/{id}", hasBody = true)
    suspend fun deleteTransaction(@Path("id") id: String, @Body body: DeleteRequest)

    @GET("valuation/transactions/{id}")
    suspend fun breakdown(@Path("id") id: String): BreakdownDto

    @GET("valuation/status")
    suspend fun valuationStatus(): ValuationStatusDto

    @GET("rates/suggest")
    suspend fun rateSuggestion(@Query("day") day: String): RateSuggestionDto

    @GET("approvals")
    suspend fun approvals(@Query("scope") scope: String): ApprovalListDto

    @POST("approvals/{id}/approve")
    suspend fun approve(@Path("id") id: String, @Body body: ApproveRequest): ApprovalItemDto

    @POST("approvals/{id}/reject")
    suspend fun reject(@Path("id") id: String, @Body body: RejectRequest): ApprovalItemDto

    @PATCH("approvals/{id}")
    suspend fun editMine(@Path("id") id: String, @Body body: EditRequest): ApprovalItemDto

    @POST("approvals/{id}/resubmit")
    suspend fun resubmit(@Path("id") id: String): ApprovalItemDto

    @POST("approvals/{id}/withdraw")
    suspend fun withdraw(@Path("id") id: String)
}
