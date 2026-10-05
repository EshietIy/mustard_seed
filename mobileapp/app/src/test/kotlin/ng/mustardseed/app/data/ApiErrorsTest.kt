package ng.mustardseed.app.data

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/** The server's error body becomes an AppError the screens can explain (AGENT.md section 7). */
class ApiErrorsTest {
    private lateinit var server: MockWebServer

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() = server.close()

    private suspend fun call() =
        ApiMenuRepository(ApiFactory(server.url("/").toString(), "0.1.0"), isOnline = { true }).menu()

    private fun respond(
        code: Int,
        body: String,
    ) = server.enqueue(
        MockResponse
            .Builder()
            .code(code)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-Request-Id", "ref-1")
            .body(body)
            .build(),
    )

    @Test
    fun `a refused request keeps the server's code and words`() =
        runTest {
            respond(
                422,
                """{"error":{"code":"ITEM_UNAVAILABLE","message":"Zobo has just sold out.","requestId":"ref-1"}}""",
            )
            assertEquals(
                Outcome.Failure(AppError.Rejected(422, "ITEM_UNAVAILABLE", "Zobo has just sold out.", emptyMap())),
                call(),
            )
        }

    @Test
    fun `validation errors come back field by field`() =
        runTest {
            respond(
                400,
                """{"error":{"code":"VALIDATION_FAILED","message":"Some fields are invalid.",""" +
                    """"details":[{"field":"contact.phone","messages":["Enter a valid Nigerian phone number"]}]}}""",
            )
            val error = (call() as Outcome.Failure).error as AppError.Rejected
            assertEquals("VALIDATION_FAILED", error.code)
            assertEquals(mapOf("contact.phone" to listOf("Enter a valid Nigerian phone number")), error.fieldErrors)
        }

    @Test
    fun `401 means sign in again, 403 means not allowed`() =
        runTest {
            respond(401, """{"error":{"code":"UNAUTHORIZED","message":"Please sign in to continue."}}""")
            assertEquals(Outcome.Failure(AppError.SignInRequired), call())
            respond(403, """{"error":{"code":"FORBIDDEN","message":"No."}}""")
            assertEquals(Outcome.Failure(AppError.Forbidden), call())
        }

    @Test
    fun `an error body that isn't ours still gives a safe error`() =
        runTest {
            respond(409, "<html>oops</html>")
            assertEquals(Outcome.Failure(AppError.Rejected(409, null, null, emptyMap())), call())
        }
}
