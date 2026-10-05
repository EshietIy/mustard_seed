package ng.mustardseed.app.data

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

private const val MENU_JSON = """
{"categories":[
  {"id":"calabar_classics","label":"Calabar classics","items":[
    {"id":"6f1c1c62-0000-4000-8000-000000000001","slug":"afang-soup","name":"Afang Soup",
     "description":"Afang and waterleaf.","priceKobo":450000,"isHouseSignature":true,
     "isFreshJuice":false,"isAvailable":true,
     "image":{"thumbnailUrl":"https://cdn.test/t.webp","fullUrl":"https://cdn.test/f.webp"},
     "optionGroups":[{"id":"6f1c1c62-0000-4000-8000-0000000000a1","name":"Soup protein",
       "minChoices":1,"maxChoices":1,"options":[
         {"id":"6f1c1c62-0000-4000-8000-0000000000b1","name":"Chicken","priceDeltaKobo":50000,"isAvailable":true}]}]},
    {"id":"6f1c1c62-0000-4000-8000-000000000002","slug":"atama-soup","name":"Atama Soup",
     "description":"","priceKobo":null,"isHouseSignature":false,"isFreshJuice":false,
     "isAvailable":false,"image":null,"optionGroups":[]}
  ]},
  {"id":"drinks","label":"Drinks","items":[]}
]}
"""

class MenuRepositoryTest {
    private lateinit var server: MockWebServer
    private var online = true

    private fun repository(timeoutMs: Long = 2_000) =
        ApiMenuRepository(
            ApiFactory(
                origin = server.url("/").toString(),
                appVersion = "0.1.0",
                timeoutMs = timeoutMs,
            ),
            isOnline = { online },
        )

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() {
        server.close()
    }

    @Test
    fun `loads the menu and maps it to the app's model`() =
        runTest {
            server.enqueue(MockResponse(body = MENU_JSON))
            val outcome = repository().menu()
            val menu = (outcome as Outcome.Success).value
            assertEquals(listOf("Calabar classics", "Drinks"), menu.categories.map { it.label })
            val afang = menu.categories[0].items[0]
            assertEquals("Afang Soup", afang.name)
            assertEquals(450_000L, afang.priceKobo)
            assertTrue(afang.isHouseSignature)
            assertEquals("https://cdn.test/t.webp", afang.thumbnailUrl)
            assertEquals(listOf("Soup protein"), afang.optionGroups.map { it.name })
            assertEquals(50_000L, afang.optionGroups[0].options[0].priceDeltaKobo)
            val atama = menu.categories[0].items[1]
            assertEquals(null, atama.priceKobo)
            assertEquals(false, atama.isAvailable)
            assertEquals(null, atama.thumbnailUrl)
        }

    @Test
    fun `asks for api v1 and says which app version is calling`() =
        runTest {
            server.enqueue(MockResponse(body = MENU_JSON))
            repository().menu()
            val request = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("/api/v1/menu", request.url.encodedPath)
            assertEquals("0.1.0", request.headers["X-App-Version"])
        }

    @Test
    fun `reads the payment mode for the test banner`() =
        runTest {
            server.enqueue(
                MockResponse(body = """{"paymentMode":"simulated","googleClientId":"x.apps.googleusercontent.com"}"""),
            )
            assertEquals(Outcome.Success(PaymentMode.SIMULATED), repository().paymentMode())
        }

    @Test
    fun `a server error keeps the request id for support`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(503)
                    .addHeader("X-Request-Id", "ref-123")
                    .body("""{"error":{"code":"SERVICE_UNAVAILABLE","message":"x","requestId":"ref-123"}}""")
                    .build(),
            )
            assertEquals(Outcome.Failure(AppError.Server(requestId = "ref-123")), repository().menu())
        }

    @Test
    fun `too many requests says how long to wait`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(429)
                    .addHeader("Retry-After", "30")
                    .build(),
            )
            assertEquals(Outcome.Failure(AppError.RateLimited(retryAfterSeconds = 30)), repository().menu())
        }

    @Test
    fun `an outdated app is told to update`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(426).build())
            assertEquals(Outcome.Failure(AppError.UpdateRequired), repository().menu())
        }

    @Test
    fun `a slow server is a timeout`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .body(MENU_JSON)
                    .headersDelay(2, TimeUnit.SECONDS)
                    .build(),
            )
            assertEquals(Outcome.Failure(AppError.Timeout), repository(timeoutMs = 300).menu())
        }

    @Test
    fun `no connection is reported as offline, or unreachable when the phone is online`() =
        runTest {
            server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build())
            online = false
            assertEquals(Outcome.Failure(AppError.Offline), repository().menu())
            server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build())
            online = true
            assertEquals(Outcome.Failure(AppError.Unreachable), repository().menu())
        }

    @Test
    fun `an unexpected body is an unknown error, never a crash`() =
        runTest {
            server.enqueue(MockResponse(body = """{"nope":true}"""))
            assertTrue((repository().menu() as Outcome.Failure).error is AppError.Unknown)
        }
}
