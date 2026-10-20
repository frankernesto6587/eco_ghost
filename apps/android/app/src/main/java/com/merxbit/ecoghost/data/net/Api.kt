package com.merxbit.ecoghost.data.net

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
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
    val category: CategoryDto? = null,
    val account: AccountDto? = null,
)

@Serializable
data class Page<T>(val data: List<T>)

/** GET /categories devuelve el árbol (raíces con sus hijas). */
@Serializable
data class CategoryNodeDto(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val isAdjustment: Boolean = false,
    val parentId: String? = null,
    val children: List<CategoryNodeDto> = emptyList(),
)

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

    @GET("transactions")
    suspend fun transactions(
        @Query("limit") limit: Int = 20,
        @Query("page") page: Int = 1,
        @Query("sortBy") sortBy: String = "date",
        @Query("sortOrder") sortOrder: String = "desc",
    ): Page<TransactionDto>

    @GET("categories")
    suspend fun categories(): List<CategoryNodeDto>

    @GET("organizations/{id}")
    suspend fun organization(@Path("id") id: String): OrgDetailDto

    @POST("transactions")
    suspend fun createTransaction(@Body body: CreateTransactionRequest): TransactionDto

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
