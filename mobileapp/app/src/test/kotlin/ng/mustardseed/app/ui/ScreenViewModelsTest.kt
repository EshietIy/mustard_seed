package ng.mustardseed.app.ui

import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import ng.mustardseed.app.api.models.QuoteProblemDto
import ng.mustardseed.app.auth.SessionState
import ng.mustardseed.app.cart.CartStore
import ng.mustardseed.app.cart.InMemoryGuestCartStorage
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.testing.EmptyCartRepository
import ng.mustardseed.app.testing.FakeMenuRepository
import ng.mustardseed.app.testing.FakeOrdersRepository
import ng.mustardseed.app.testing.ORDER_ID
import ng.mustardseed.app.testing.item
import ng.mustardseed.app.testing.order
import ng.mustardseed.app.testing.quote
import ng.mustardseed.app.testing.tracked
import ng.mustardseed.app.ui.checkout.CheckoutViewModel
import ng.mustardseed.app.ui.checkout.Field
import ng.mustardseed.app.ui.checkout.FieldError
import ng.mustardseed.app.ui.order.CONFIRM_MAX_POLLS
import ng.mustardseed.app.ui.order.CONFIRM_POLL_MS
import ng.mustardseed.app.ui.order.OrderEvent
import ng.mustardseed.app.ui.order.OrderMode
import ng.mustardseed.app.ui.order.OrderViewModel
import ng.mustardseed.app.ui.track.TRACK_REFRESH_MS
import ng.mustardseed.app.ui.track.TrackViewModel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class ScreenViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    private val orders = FakeOrdersRepository()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val soup = item("Afang Soup", priceKobo = 450_000).copy(id = "00000000-0000-4000-8000-0000000000aa")

    private fun TestScope.cartWithSoup(): CartStore {
        val cart =
            CartStore(
                MutableStateFlow(SessionState.SignedOut),
                EmptyCartRepository(),
                InMemoryGuestCartStorage(),
                CoroutineScope(dispatcher),
            )
        kotlinx.coroutines.runBlocking { cart.add(soup) }
        return cart
    }

    // ---------- checkout ----------

    @Test
    fun `checkout prefills the name and quotes the cart for delivery`() =
        runTest(dispatcher) {
            val vm = CheckoutViewModel(cartWithSoup(), orders, "Ekaette Bassey")
            advanceUntilIdle()
            assertEquals("Ekaette Bassey", vm.state.value.fullName)
            assertEquals(
                1_050_000L,
                vm.state.value.quote
                    ?.totalKobo,
            )
            assertEquals("quote delivery", orders.calls.last())
            vm.setDelivery(false)
            advanceUntilIdle()
            assertEquals("quote pickup", orders.calls.last())
        }

    @Test
    fun `checkout checks required fields before sending`() =
        runTest(dispatcher) {
            val vm = CheckoutViewModel(cartWithSoup(), orders, "")
            advanceUntilIdle()
            vm.submit()
            advanceUntilIdle()
            assertEquals(setOf(Field.NAME, Field.PHONE, Field.ADDRESS), vm.state.value.fieldErrors.keys)
            assertFalse("place" in orders.calls)
        }

    @Test
    fun `checkout places the order with the total the customer saw and reports its id`() =
        runTest(dispatcher) {
            orders.placeAnswers += Outcome.Success(order())
            val vm = CheckoutViewModel(cartWithSoup(), orders, "Ekaette Bassey")
            advanceUntilIdle()
            vm.setPhone("0803 123 4567")
            vm.setAddress("12 Marian Road")
            vm.submit()
            advanceUntilIdle()
            assertEquals(ORDER_ID.toString(), vm.placed.first())
            val sent = orders.placed!!
            assertEquals(1_050_000L, sent.expectedTotalKobo)
            assertEquals("12 Marian Road", sent.delivery?.streetAddress)
            assertEquals(UUID.fromString(soup.id), sent.items.single().menuItemId)
        }

    @Test
    fun `checkout shows the server's field errors next to the inputs`() =
        runTest(dispatcher) {
            orders.placeAnswers +=
                Outcome.Failure(
                    AppError.Rejected(
                        400,
                        "VALIDATION_FAILED",
                        "Some fields are invalid.",
                        mapOf("contact.phone" to listOf("Enter a valid Nigerian phone number")),
                    ),
                )
            val vm = CheckoutViewModel(cartWithSoup(), orders, "Ekaette Bassey")
            advanceUntilIdle()
            vm.setPhone("123")
            vm.setAddress("12 Marian Road")
            vm.submit()
            advanceUntilIdle()
            assertEquals(
                FieldError.Server("Enter a valid Nigerian phone number"),
                vm.state.value.fieldErrors[Field.PHONE],
            )
        }

    @Test
    fun `when prices change, checkout explains and shows the new total`() =
        runTest(dispatcher) {
            orders.placeAnswers +=
                Outcome.Failure(
                    AppError.Rejected(
                        409,
                        "PRICE_CHANGED",
                        "Prices have changed since you started checkout.",
                        emptyMap(),
                    ),
                )
            val vm = CheckoutViewModel(cartWithSoup(), orders, "Ekaette Bassey")
            advanceUntilIdle()
            orders.quoteAnswer = Outcome.Success(quote(total = 1_100_000))
            vm.setPhone("0803 123 4567")
            vm.setAddress("12 Marian Road")
            vm.submit()
            advanceUntilIdle()
            assertEquals("Prices have changed since you started checkout.", vm.state.value.notice)
            assertEquals(
                1_100_000L,
                vm.state.value.quote
                    ?.totalKobo,
            )
        }

    @Test
    fun `checkout won't submit while the quote has problems`() =
        runTest(dispatcher) {
            orders.quoteAnswer =
                Outcome.Success(
                    quote(
                        problems = listOf(QuoteProblemDto("ORDERING_CLOSED", "Online orders are open 8am – 10:30pm.")),
                    ),
                )
            val vm = CheckoutViewModel(cartWithSoup(), orders, "Ekaette Bassey")
            advanceUntilIdle()
            vm.setPhone("0803 123 4567")
            vm.setAddress("12 Marian Road")
            vm.submit()
            advanceUntilIdle()
            assertFalse("place" in orders.calls)
        }

    // ---------- order ----------

    private fun TestScope.orderVm(reference: String? = null) =
        OrderViewModel(ORDER_ID.toString(), reference, orders, cartWithSoup(), FakeMenuRepository())

    @Test
    fun `the order page loads the order`() =
        runTest(dispatcher) {
            orders.getAnswers += Outcome.Success(order())
            val vm = orderVm()
            advanceUntilIdle()
            assertEquals(
                "#MS-0007",
                vm.state.value.order
                    ?.orderNumber,
            )
            assertEquals(OrderMode.VIEW, vm.state.value.mode)
        }

    @Test
    fun `Pay now opens the payment page, and coming back confirms with the server`() =
        runTest(dispatcher) {
            orders.getAnswers += Outcome.Success(order())
            orders.verifyAnswers += Outcome.Success(order(status = "paid"))
            val vm = orderVm()
            advanceUntilIdle()
            vm.payNow()
            advanceUntilIdle()
            assertEquals(OrderEvent.OpenPaymentPage("https://pay.test/checkout/abc"), vm.events.first())
            vm.onReturn()
            advanceUntilIdle()
            assertEquals("verify MS0007-abc", orders.calls.last())
            assertEquals(
                "paid",
                vm.state.value.order
                    ?.status,
            )
        }

    @Test
    fun `returning with a reference never assumes - it confirms, polling while pending`() =
        runTest(dispatcher) {
            orders.verifyAnswers += Outcome.Success(order())
            orders.verifyAnswers += Outcome.Success(order())
            orders.verifyAnswers += Outcome.Success(order(status = "paid"))
            val vm = orderVm(reference = "MS0007-abc")
            runCurrent()
            assertEquals(OrderMode.CONFIRMING, vm.state.value.mode)
            advanceTimeBy(CONFIRM_POLL_MS * 2 + 1)
            runCurrent()
            assertEquals(OrderMode.VIEW, vm.state.value.mode)
            assertEquals(
                "paid",
                vm.state.value.order
                    ?.status,
            )
        }

    @Test
    fun `a payment still pending after a while says so and offers to check again`() =
        runTest(dispatcher) {
            orders.verifyAnswers += Outcome.Success(order())
            val vm = orderVm(reference = "MS0007-abc")
            advanceTimeBy(CONFIRM_POLL_MS * (CONFIRM_MAX_POLLS + 1))
            runCurrent()
            assertEquals(OrderMode.STILL_PENDING, vm.state.value.mode)
        }

    @Test
    fun `a failed confirmation shows the error and never guesses`() =
        runTest(dispatcher) {
            orders.verifyAnswers += Outcome.Failure(AppError.Server("ref-1"))
            val vm = orderVm(reference = "MS0007-abc")
            advanceUntilIdle()
            assertEquals(OrderMode.CONFIRM_ERROR, vm.state.value.mode)
            assertEquals(AppError.Server("ref-1"), vm.state.value.confirmError)
        }

    @Test
    fun `an order that can no longer be paid explains and refreshes`() =
        runTest(dispatcher) {
            orders.getAnswers += Outcome.Success(order())
            orders.getAnswers += Outcome.Success(order(status = "expired"))
            orders.startAnswer =
                Outcome.Failure(
                    AppError.Rejected(409, "ORDER_EXPIRED", "This order expired before it was paid.", emptyMap()),
                )
            val vm = orderVm()
            advanceUntilIdle()
            vm.payNow()
            advanceUntilIdle()
            assertEquals("This order expired before it was paid.", vm.state.value.notice)
            assertEquals(
                "expired",
                vm.state.value.order
                    ?.status,
            )
        }

    @Test
    fun `Order again puts still-offered items back and goes to checkout`() =
        runTest(dispatcher) {
            orders.getAnswers += Outcome.Success(order(status = "payment_failed", options = listOf("o-gone")))
            val vm = orderVm()
            advanceUntilIdle()
            vm.orderAgain()
            advanceUntilIdle()
            assertEquals(OrderEvent.SomeLeftOut, vm.events.first())
            assertEquals(OrderEvent.GoToCheckout, vm.events.first())
        }

    // ---------- tracking ----------

    @Test
    fun `tracking refreshes every 20 seconds and stops when delivered`() =
        runTest(dispatcher) {
            orders.trackAnswers += Outcome.Success(order(status = "paid").tracked())
            orders.trackAnswers += Outcome.Success(order(status = "preparing").tracked())
            orders.trackAnswers += Outcome.Success(order(status = "delivered").tracked())
            val vm = TrackViewModel("tok", orders)
            runCurrent()
            assertEquals(
                "paid",
                vm.state.value.order
                    ?.status,
            )
            advanceTimeBy(TRACK_REFRESH_MS + 1)
            runCurrent()
            assertEquals(
                "preparing",
                vm.state.value.order
                    ?.status,
            )
            advanceTimeBy(TRACK_REFRESH_MS + 1)
            runCurrent()
            assertEquals(
                "delivered",
                vm.state.value.order
                    ?.status,
            )
            advanceTimeBy(TRACK_REFRESH_MS * 5)
            assertEquals(3, orders.calls.count { it == "track" })
        }

    @Test
    fun `tracking keeps the order on screen when a refresh fails`() =
        runTest(dispatcher) {
            orders.trackAnswers += Outcome.Success(order(status = "paid").tracked())
            orders.trackAnswers += Outcome.Failure(AppError.Unreachable)
            val vm = TrackViewModel("tok", orders)
            runCurrent()
            advanceTimeBy(TRACK_REFRESH_MS + 1)
            runCurrent()
            assertTrue(vm.state.value.refreshFailed)
            assertEquals(
                "paid",
                vm.state.value.order
                    ?.status,
            )
            // Leaving the screen stops the polling (otherwise it runs for ever).
            vm.viewModelScope.cancel()
        }

    @Test
    fun `an unknown tracking link says so`() =
        runTest(dispatcher) {
            orders.trackAnswers += Outcome.Failure(AppError.NotFound)
            val vm = TrackViewModel("tok", orders)
            advanceUntilIdle()
            assertEquals(AppError.NotFound, vm.state.value.loadError)
            assertNull(vm.state.value.order)
        }
}
