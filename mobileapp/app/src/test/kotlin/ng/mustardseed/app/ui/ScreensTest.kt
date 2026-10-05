package ng.mustardseed.app.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import ng.mustardseed.app.cart.CartLine
import ng.mustardseed.app.cart.CartOption
import ng.mustardseed.app.cart.CartState
import ng.mustardseed.app.cart.PriceChange
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Option
import ng.mustardseed.app.data.OptionGroup
import ng.mustardseed.app.data.toView
import ng.mustardseed.app.testing.item
import ng.mustardseed.app.testing.order
import ng.mustardseed.app.testing.quote
import ng.mustardseed.app.testing.tracked
import ng.mustardseed.app.ui.cart.CartActions
import ng.mustardseed.app.ui.cart.CartScreen
import ng.mustardseed.app.ui.checkout.CheckoutActions
import ng.mustardseed.app.ui.checkout.CheckoutScreen
import ng.mustardseed.app.ui.checkout.CheckoutUiState
import ng.mustardseed.app.ui.checkout.Field
import ng.mustardseed.app.ui.checkout.FieldError
import ng.mustardseed.app.ui.menu.ChoiceSheet
import ng.mustardseed.app.ui.order.OrderActions
import ng.mustardseed.app.ui.order.OrderMode
import ng.mustardseed.app.ui.order.OrderScreen
import ng.mustardseed.app.ui.order.OrderUiState
import ng.mustardseed.app.ui.theme.MustardSeedTheme
import ng.mustardseed.app.ui.track.TrackScreen
import ng.mustardseed.app.ui.track.TrackUiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.OffsetDateTime

/** Feature scenarios for the ordering screens (Given / When / Then in each name). */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "w411dp-h1600dp")
class ScreensTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) =
        compose.setContent {
            MustardSeedTheme { content() }
        }

    // ---------- choice sheet ----------

    private val soup =
        item(
            "Afang Soup",
            priceKobo = 400_000,
            optionGroups =
                listOf(
                    OptionGroup(
                        "g-protein",
                        "Soup protein",
                        1,
                        1,
                        listOf(
                            Option("o-beef", "Beef", 0, true),
                            Option("o-chicken", "Chicken", 50_000, true),
                            Option("o-turkey", "Turkey", 0, false),
                        ),
                    ),
                ),
        )

    @Test
    fun `the choice sheet waits for a required protein, shows extra costs, and adds the choice`() {
        val added = mutableListOf<List<String>>()
        show { ChoiceSheet(soup, onAdd = { added += it }) }
        compose.onNodeWithText("Required · choose 1").assertIsDisplayed()
        compose.onNodeWithText("Choose a soup protein to add this.").assertIsDisplayed()
        compose.onNodeWithText("Add to order · ₦4,000").assertIsNotEnabled()
        compose.onNodeWithText("+₦500").assertIsDisplayed()
        compose.onNodeWithText("Not available").assertIsDisplayed()
        compose.onNodeWithText("Chicken").performClick()
        compose.onNodeWithText("Add to order · ₦4,500").assertIsEnabled().performClick()
        assertEquals(listOf(listOf("o-chicken")), added)
    }

    @Test
    fun `a switched-off option can't be chosen`() {
        show { ChoiceSheet(soup, onAdd = {}) }
        compose.onNodeWithText("Turkey").performClick()
        compose.onNodeWithText("Choose a soup protein to add this.").assertIsDisplayed()
    }

    // ---------- cart ----------

    private fun cartLine(
        quantity: Int = 2,
        problems: List<String> = emptyList(),
        priceChange: PriceChange? = null,
    ) = CartLine(
        key = "soup|o-chicken",
        itemId = "soup",
        name = "Afang Soup",
        unitPriceKobo = 450_000,
        quantity = quantity,
        isAvailable = true,
        options = listOf(CartOption("o-chicken", "Chicken", 50_000)),
        problems = problems,
        priceChange = priceChange,
    )

    @Test
    fun `the cart lists lines with their choices and changes quantities`() {
        val calls = mutableListOf<String>()
        show {
            CartScreen(
                CartState(listOf(cartLine())),
                site = null,
                actions = CartActions(onIncrement = { calls += "+$it" }, onCheckout = { calls += "checkout" }),
            )
        }
        compose.onNodeWithText("Chicken").assertIsDisplayed()
        // The line total and the subtotal.
        compose.onAllNodesWithText("₦9,000").assertCountEquals(2)
        compose.onNodeWithContentDescription("Add one more Afang Soup (Chicken)").performClick()
        compose.onNodeWithText("Checkout").performClick()
        assertEquals(listOf("+soup|o-chicken", "checkout"), calls)
    }

    @Test
    fun `a price change is shown with OK, and checkout waits for it`() {
        var accepted = ""
        show {
            CartScreen(
                CartState(listOf(cartLine(priceChange = PriceChange(400_000, 450_000)))),
                site = null,
                actions = CartActions(onAcceptPrice = { accepted = it }),
            )
        }
        compose.onNodeWithText("Price changed from ₦4,000 to ₦4,500.").assertIsDisplayed()
        compose.onNodeWithText("Some prices have changed. Check them and tap OK to continue.").assertIsDisplayed()
        compose.onNodeWithText("Checkout").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Accept the new price for Afang Soup (Chicken)").performClick()
        assertEquals("soup|o-chicken", accepted)
    }

    @Test
    fun `a line the server can't sell says why`() {
        show {
            CartScreen(
                CartState(listOf(cartLine(problems = listOf("Afang Soup has just sold out.")))),
                null,
                CartActions(),
            )
        }
        compose.onNodeWithText("Afang Soup has just sold out.").assertIsDisplayed()
        compose.onNodeWithText("Checkout").assertIsNotEnabled()
    }

    @Test
    fun `an empty cart says so`() {
        show { CartScreen(CartState(), null, CartActions()) }
        compose.onNodeWithText("Your order is empty").assertIsDisplayed()
    }

    // ---------- checkout ----------

    @Test
    fun `checkout asks a signed-out customer to sign in, keeping the order`() {
        var signIn = 0
        show {
            CheckoutScreen(
                CheckoutUiState(),
                CartState(
                    listOf(cartLine()),
                ),
                signedIn = false,
                actions =
                    CheckoutActions(onSignIn = {
                        signIn++
                    }),
            )
        }
        compose.onNodeWithText("Sign in to place your order").assertIsDisplayed()
        compose.onNodeWithText("Sign in").performClick()
        assertEquals(1, signIn)
    }

    @Test
    fun `checkout shows the server total, field errors and places the order`() {
        var submitted = 0
        show {
            CheckoutScreen(
                CheckoutUiState(
                    fullName = "Ekaette Bassey",
                    quote = quote(),
                    fieldErrors =
                        mapOf(Field.PHONE to FieldError.Missing),
                ),
                CartState(listOf(cartLine())),
                signedIn = true,
                actions = CheckoutActions(onSubmit = { submitted++ }),
            )
        }
        compose.onNodeWithText("₦10,500").assertIsDisplayed()
        compose.onNodeWithText("Enter a phone number so the rider can reach you").assertIsDisplayed()
        compose.onNodeWithText("Place order").performClick()
        assertEquals(1, submitted)
    }

    @Test
    fun `checkout explains why an order can't be placed and disables it`() {
        val closed =
            quote(
                problems =
                    listOf(
                        ng.mustardseed.app.api.models.QuoteProblemDto(
                            "ORDERING_CLOSED",
                            "Online orders are open 8am – 10:30pm. Please come back then.",
                        ),
                    ),
            )
        show { CheckoutScreen(CheckoutUiState(quote = closed), CartState(listOf(cartLine())), true, CheckoutActions()) }
        compose.onNodeWithText("Online orders are open 8am – 10:30pm. Please come back then.").assertIsDisplayed()
        compose.onNodeWithText("Place order").assertIsNotEnabled()
    }

    // ---------- order ----------

    @Test
    fun `an unpaid order offers Pay now with the deadline and the email note`() {
        var paid = 0
        show {
            OrderScreen(
                OrderUiState(order = order().toView()),
                "Ekaette",
                "e@example.com",
                OrderActions(onPayNow = { paid++ }),
            )
        }
        compose.onNodeWithText("Order #MS-0007").assertIsDisplayed()
        compose.onNodeWithText("Pay by 12:15pm, or this order will expire.").assertIsDisplayed()
        compose
            .onNodeWithText(
                "Once your payment is confirmed, we'll email your order confirmation to e@example.com.",
            ).assertIsDisplayed()
        compose.onNodeWithText("Pay ₦10,500 now").performClick()
        assertEquals(1, paid)
    }

    @Test
    fun `while confirming a payment it says so`() {
        show { OrderScreen(OrderUiState(mode = OrderMode.CONFIRMING), null, null, OrderActions()) }
        compose.onNodeWithText("Confirming your payment…").assertIsDisplayed()
    }

    @Test
    fun `a paid order is in the kitchen with the arrival time`() {
        val paid = order(status = "paid", eta = OffsetDateTime.parse("2026-10-05T18:45:00Z")).toView()
        show { OrderScreen(OrderUiState(order = paid), "Ekaette", "e@example.com", OrderActions()) }
        compose.onNodeWithText("Amedi, Ekaette! Your order is in the kitchen.").assertIsDisplayed()
        compose.onNodeWithText("Estimated arrival: 7:45pm").assertIsDisplayed()
        compose.onNodeWithText("We'll email your confirmation to e@example.com shortly.").assertIsDisplayed()
    }

    @Test
    fun `a failed payment says nothing was charged and offers Order again`() {
        var again = 0
        show {
            OrderScreen(
                OrderUiState(
                    order = order(status = "payment_failed").toView(),
                ),
                null,
                null,
                OrderActions(onOrderAgain = {
                    again++
                }),
            )
        }
        compose.onNodeWithText("Your payment didn't go through. You have not been charged.").assertIsDisplayed()
        compose.onNodeWithText("Order again").performClick()
        assertEquals(1, again)
    }

    @Test
    fun `a confirmation error never guesses and offers to try again`() {
        show {
            OrderScreen(
                OrderUiState(mode = OrderMode.CONFIRM_ERROR, confirmError = AppError.Server("ref-9")),
                null,
                null,
                OrderActions(),
            )
        }
        compose.onNodeWithText("We couldn't confirm your payment yet.").assertIsDisplayed()
        compose.onNodeWithText("Reference: ref-9").assertIsDisplayed()
    }

    // ---------- tracking ----------

    @Test
    fun `tracking shows progress, the arrival time and the delivery details`() {
        val preparing =
            order(
                status = "preparing",
                eta = OffsetDateTime.parse("2026-10-05T18:45:00Z"),
            ).tracked().toView()
        show { TrackScreen(TrackUiState(order = preparing), {}, {}) }
        compose.onAllNodesWithText("Preparing", useUnmergedTree = true).onFirst().assertIsDisplayed()
        compose.onNodeWithText("Estimated arrival: 7:45pm").assertIsDisplayed()
        compose.onNodeWithText("12 Marian Road").assertIsDisplayed()
        compose.onNodeWithText("This page updates by itself.").assertIsDisplayed()
    }

    @Test
    fun `a broken tracking link explains what to do`() {
        show { TrackScreen(TrackUiState(loadError = AppError.NotFound), {}, {}) }
        compose.onNodeWithText("We couldn't find this order.").assertIsDisplayed()
        compose.onNodeWithText("Back to the menu").assertIsDisplayed()
    }

    @Test
    fun `a failed refresh keeps the order and says it will keep trying`() {
        show {
            TrackScreen(
                TrackUiState(order = order(status = "paid").tracked().toView(), refreshFailed = true),
                {},
                {},
            )
        }
        compose.onNodeWithText("We couldn't refresh this page. We'll keep trying.").assertIsDisplayed()
    }
}
