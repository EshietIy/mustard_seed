package ng.mustardseed.app.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ng.mustardseed.app.api.apis.AuthApi
import ng.mustardseed.app.api.models.AppGoogleSignInDto
import ng.mustardseed.app.api.models.AppRefreshDto
import ng.mustardseed.app.api.models.AppSessionDto
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.data.apiCall
import ng.mustardseed.app.data.apiCallNoContent

sealed interface SessionState {
    data object SignedOut : SessionState

    data class SignedIn(
        val user: SignedInUser,
    ) : SessionState
}

/** Gives the HTTP client the current access token, and a fresh one after a 401. */
interface TokenProvider {
    fun accessToken(): String?

    /** A new access token after [failedToken] was refused, or null when signed out. */
    suspend fun refreshAfter(failedToken: String): String?
}

/**
 * The app's sign-in (AGENT.md section 15): Google ID token in, bearer tokens out. Refresh
 * tokens are single use, so only one refresh runs at a time; requests that failed with the
 * same token wait and reuse its result.
 */
class SessionManager(
    private val auth: AuthApi,
    private val store: TokenStore,
    private val isOnline: () -> Boolean,
) : TokenProvider {
    private val refreshLock = Mutex()
    private val _state =
        MutableStateFlow<SessionState>(
            store.read()?.let { SessionState.SignedIn(it.user) } ?: SessionState.SignedOut,
        )
    val state: StateFlow<SessionState> = _state.asStateFlow()

    override fun accessToken(): String? = store.read()?.accessToken

    suspend fun signIn(idToken: String): Outcome<SignedInUser> {
        val outcome = apiCall(isOnline, { auth.appAuthControllerGoogleV1(AppGoogleSignInDto(idToken)) }) { it }
        return when (outcome) {
            is Outcome.Success -> Outcome.Success(save(outcome.value))
            is Outcome.Failure -> outcome
        }
    }

    override suspend fun refreshAfter(failedToken: String): String? =
        refreshLock.withLock {
            val current = store.read() ?: return@withLock null
            // Another request already refreshed while this one waited.
            if (current.accessToken != failedToken) return@withLock current.accessToken
            val outcome =
                apiCall(isOnline, { auth.appAuthControllerRefreshV1(AppRefreshDto(current.refreshToken)) }) { it }
            when (outcome) {
                is Outcome.Success -> {
                    save(outcome.value)
                    outcome.value.accessToken
                }

                is Outcome.Failure -> {
                    // Refused (expired, revoked, reused): the session is over. A network problem
                    // keeps it, so the next request can try again.
                    if (outcome.error is AppError.SignInRequired || outcome.error is AppError.Rejected) forget()
                    null
                }
            }
        }

    /** Signs out here and on the server; works offline (the tokens are forgotten either way). */
    suspend fun signOut() {
        val refreshToken = store.read()?.refreshToken
        forget()
        if (refreshToken != null) {
            apiCallNoContent(isOnline) { auth.appAuthControllerLogoutV1(AppRefreshDto(refreshToken)) }
        }
    }

    private fun save(dto: AppSessionDto): SignedInUser {
        val user =
            SignedInUser(
                id = dto.user.id.toString(),
                email = dto.user.email,
                firstName = dto.user.firstName,
                fullName = dto.user.fullName,
                role = dto.user.role.value,
            )
        store.write(StoredSession(dto.accessToken, dto.refreshToken, user))
        _state.value = SessionState.SignedIn(user)
        return user
    }

    private fun forget() {
        store.clear()
        _state.value = SessionState.SignedOut
    }
}
