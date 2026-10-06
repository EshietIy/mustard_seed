package ng.mustardseed.app.data

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import ng.mustardseed.app.api.models.OrderItemInputDto
import ng.mustardseed.app.api.models.QuoteRequestDto
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID
import java.util.concurrent.TimeUnit

/** The live staging API's answer to a quote (copied verbatim). */
private const val LIVE_QUOTE =
    """{"lines":[{"menuItemId":"5e99e0c1-d342-45ea-937b-c7fbe270f916",""" +
        """"name":"Ekpang Nkukwo","unitPriceKobo":345600,""" +
        """"quantity":1,"lineTotalKobo":345600,"isAvailable":true,"options":[]}],"subtotalKobo":345600,""" +
        """"deliveryFeeKobo":150000,"totalKobo":495600,"ordering":{"open":false,"opensAt":"08:00",""" +
        """"onlineOrdersCloseAt":"22:30","timezone":"Africa/Lagos"},"problems":[{"code":"ORDERING_CLOSED",""" +
        """"message":"Online orders are open 8am – 10:30pm. Please come back then."}],"canPlaceOrder":false}"""

class OrdersRepositoryTest {
    private lateinit var server: MockWebServer

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() = server.close()

    @Test
    fun `a quote with chosen options is sent and the server's answer is read`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .addHeader("Content-Type", "application/json")
                    .body(LIVE_QUOTE)
                    .build(),
            )
            val repo = ApiOrdersRepository(ApiFactory(server.url("/").toString(), "0.1.0"), isOnline = { true })
            val soup = UUID.fromString("00000000-0000-4000-8000-0000000000bb")
            val chicken = UUID.fromString("00000000-0000-4000-8000-0000000000cc")
            val outcome =
                repo.quote(
                    QuoteRequestDto(
                        QuoteRequestDto.Fulfilment.DELIVERY,
                        "calabar",
                        listOf(OrderItemInputDto(soup, 1, listOf(chicken))),
                    ),
                )
            assertTrue("got $outcome", outcome is Outcome.Success)
            assertEquals(495_600L, (outcome as Outcome.Success).value.totalKobo)
            val sent = server.takeRequest(5, TimeUnit.SECONDS)!!.body!!.utf8()
            assertTrue(sent, sent.contains("\"optionIds\":[\"$chicken\"]"))
            assertTrue(sent, sent.contains("\"menuItemId\":\"$soup\""))
        }
}
