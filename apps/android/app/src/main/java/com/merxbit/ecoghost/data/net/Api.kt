package com.merxbit.ecoghost.data.net

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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
)

@Serializable
data class OverviewDto(
    val totalBalance: Map<String, Long> = emptyMap(),
    val accountBalances: List<AccountBalanceDto> = emptyList(),
    val monthIncome: Map<String, Long> = emptyMap(),
    val monthExpense: Map<String, Long> = emptyMap(),
    val pendingDebtsReceivable: Map<String, Long> = emptyMap(),
    val pendingDebtsPayable: Map<String, Long> = emptyMap(),
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
    val category: CategoryDto? = null,
    val account: AccountDto? = null,
)

@Serializable
data class Page<T>(val data: List<T>)

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
}
