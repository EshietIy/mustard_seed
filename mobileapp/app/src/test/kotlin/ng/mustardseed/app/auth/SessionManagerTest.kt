package ng.mustardseed.app.auth

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import ng.mustardseed.app.data.ApiFactory
import ng.mustardseed.app.data.ApiMenuRepository
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Outcome
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

private fun session(
    access: String,
    refresh: String,
) = """{"user":{"id":"6f1c1c62-0000-4000-8000-000000000001","email":"ekaette@example.com",""" +
    """"firstName":"Ekaette","fullName":"Ekaette Bassey",""" +
    """"avatarUrl":null,"role":"customer"},"accessToken":"$access","accessTokenExpiresAt":"2026-10-05T12:15:00Z",""" +
    """"refreshToken":"$refresh","refreshTokenExpiresAt":"2026-11-04T12:00:00Z"}"""

private const val EMPTY_MENU = """{"categories":[]}"""

class SessionManagerTest {
    private lateinit var server: MockWebServer
    private val store = InMemoryTokenStore()

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() = server.close()

    private fun json(
        code: Int,
        body: String,
    ) = server.enqueue(
        MockResponse
            .Builder()
            .code(code)
            .addHeader("Content-Type", "application/json")
            .body(body)
            .build(),
    )

    private fun setup(): Pair<SessionManager, ApiFactory> {
        val origin = server.url("/").toString()
        val manager = SessionManager(ApiFactory(origin, "0.1.0").auth, store, isOnline = { true })
        return manager to ApiFactory(origin, "0.1.0", session = manager)
    }

    @Test
    fun `signing in keeps the tokens and the user`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            val (manager) = setup()
            val result = manager.signIn("google-id-token")
            assertEquals("Ekaette", (result as Outcome.Success).value.firstName)
            assertEquals(SessionState.SignedIn(result.value), manager.state.value)
            assertEquals("access-1", store.read()?.accessToken)
            val request = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("/api/v1/auth/app/google", request.url.encodedPath)
            assertTrue(request.body!!.utf8().contains("google-id-token"))
        }

    @Test
    fun `requests carry the access token`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            json(200, EMPTY_MENU)
            val (manager, api) = setup()
            manager.signIn("tok")
            server.takeRequest(5, TimeUnit.SECONDS)!!
            ApiMenuRepository(api, isOnline = { true }).menu()
            assertEquals("Bearer access-1", server.takeRequest(5, TimeUnit.SECONDS)!!.headers["Authorization"])
        }

    @Test
    fun `an expired access token is refreshed once and the request retried`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            json(401, """{"error":{"code":"UNAUTHORIZED"}}""")
            json(200, session("access-2", "refresh-2"))
            json(200, EMPTY_MENU)
            val (manager, api) = setup()
            manager.signIn("tok")
            val outcome = ApiMenuRepository(api, isOnline = { true }).menu()
            assertTrue(outcome is Outcome.Success)
            server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("Bearer access-1", server.takeRequest(5, TimeUnit.SECONDS)!!.headers["Authorization"])
            val refresh = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("/api/v1/auth/app/refresh", refresh.url.encodedPath)
            assertTrue(refresh.body!!.utf8().contains("refresh-1"))
            assertEquals("Bearer access-2", server.takeRequest(5, TimeUnit.SECONDS)!!.headers["Authorization"])
            assertEquals("refresh-2", store.read()?.refreshToken)
        }

    @Test
    fun `a refused refresh signs out and the request reports sign-in required`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            json(401, """{"error":{"code":"UNAUTHORIZED"}}""")
            json(401, """{"error":{"code":"SESSION_REVOKED"}}""")
            val (manager, api) = setup()
            manager.signIn("tok")
            assertEquals(Outcome.Failure(AppError.SignInRequired), ApiMenuRepository(api, isOnline = { true }).menu())
            assertEquals(SessionState.SignedOut, manager.state.value)
            assertNull(store.read())
        }

    @Test
    fun `signing out revokes the session on the server and forgets the tokens`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            server.enqueue(MockResponse.Builder().code(204).build())
            val (manager) = setup()
            manager.signIn("tok")
            manager.signOut()
            server.takeRequest(5, TimeUnit.SECONDS)!!
            val logout = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("/api/v1/auth/app/logout", logout.url.encodedPath)
            assertTrue(logout.body!!.utf8().contains("refresh-1"))
            assertEquals(SessionState.SignedOut, manager.state.value)
            assertNull(store.read())
        }

    @Test
    fun `signing out works offline too`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            val (manager) = setup()
            manager.signIn("tok")
            server.close()
            manager.signOut()
            assertEquals(SessionState.SignedOut, manager.state.value)
            assertNull(store.read())
        }

    @Test
    fun `a saved session is restored when the app starts`() =
        runTest {
            json(200, session("access-1", "refresh-1"))
            setup().first.signIn("tok")
            val restored =
                SessionManager(ApiFactory(server.url("/").toString(), "0.1.0").auth, store, isOnline = { true })
            assertEquals("ekaette@example.com", (restored.state.value as SessionState.SignedIn).user.email)
        }

    @Test
    fun `a failed sign-in explains why and stays signed out`() =
        runTest {
            json(401, """{"error":{"code":"EMAIL_NOT_VERIFIED","message":"Verify your Google email."}}""")
            val (manager) = setup()
            assertEquals(Outcome.Failure(AppError.SignInRequired), manager.signIn("tok"))
            assertEquals(SessionState.SignedOut, manager.state.value)
        }
}
