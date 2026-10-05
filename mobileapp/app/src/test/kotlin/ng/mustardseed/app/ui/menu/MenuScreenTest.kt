package ng.mustardseed.app.ui.menu

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import ng.mustardseed.app.api.models.BranchDto
import ng.mustardseed.app.api.models.DeliveryDto
import ng.mustardseed.app.api.models.HoursDto
import ng.mustardseed.app.api.models.SiteInfoDto
import ng.mustardseed.app.auth.SignedInUser
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.testing.sampleMenu
import ng.mustardseed.app.ui.theme.MustardSeedTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** Feature: browsing the menu in the app. Each test is one scenario (Given / When / Then). */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class MenuScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(
        state: MenuUiState,
        onRetry: () -> Unit = {},
        extras: HomeExtras = HomeExtras(),
    ) {
        compose.setContent {
            MustardSeedTheme {
                var current by remember { mutableStateOf(state) }
                MenuScreen(
                    state = current,
                    onRetry = onRetry,
                    onSelectCategory = { current = current.copy(selectedCategoryId = it) },
                    extras = extras,
                )
            }
        }
    }

    private val ready =
        MenuUiState(content = MenuContent.Ready(sampleMenu()), selectedCategoryId = "calabar_classics")

    private fun list() = compose.onNodeWithTag("menu-list")

    /** Scrolls the page to the text (as a customer would), then checks it is on screen. */
    private fun seeText(text: String) {
        list().performScrollToNode(hasText(text))
        compose.onNodeWithText(text).assertIsDisplayed()
    }

    @Test
    fun `the menu shows dishes with prices, placeholders, badges and sold-out items`() {
        show(ready)
        seeText("From our pots to your table")
        seeText("Calabar classics")
        list().performScrollToNode(hasText("House signature"))
        seeText("House signature")
        list().performScrollToNode(hasText("[PRICE]"))
        seeText("[PRICE]")
        list().performScrollToNode(hasText("₦4,500"))
        compose.onNodeWithText("Choose: Soup protein").assertExists()
        list().performScrollToNode(hasText("Sold out"))
        seeText("Sold out")
    }

    @Test
    fun `dishes without a photo show the Photo coming placeholder`() {
        show(ready)
        list().performScrollToNode(hasText("Edikang Ikong"))
        compose.onNodeWithText("Photo coming", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `choosing a category shows its dishes`() {
        show(ready)
        list().performScrollToNode(hasText("Drinks"))
        compose.onNodeWithText("Drinks").performClick()
        list().performScrollToNode(hasText("₦800"))
        compose.onNodeWithText("Zobo").assertExists()
        seeText("₦800")
    }

    @Test
    fun `an empty category says more dishes are coming`() {
        show(ready)
        list().performScrollToNode(hasText("Swallow & sides"))
        compose.onNodeWithText("Swallow & sides").performClick()
        list().performScrollToNode(hasText("More dishes are coming to this part of the menu soon."))
    }

    @Test
    fun `while loading, it says so`() {
        show(MenuUiState(content = MenuContent.Loading))
        seeText("Loading the menu…")
    }

    @Test
    fun `a server failure explains it, shows a reference, and retries`() {
        var retries = 0
        show(MenuUiState(content = MenuContent.Failed(AppError.Server("ref-9"))), onRetry = { retries++ })
        seeText("We couldn't load the menu.")
        seeText("Something went wrong on our side. Please try again.")
        seeText("Reference: ref-9")
        list().performScrollToNode(hasText("Try again"))
        compose.onNodeWithText("Try again").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun `being offline is explained in plain words`() {
        show(MenuUiState(content = MenuContent.Failed(AppError.Offline)))
        seeText("You appear to be offline. Check your connection and try again.")
    }

    @Test
    fun `an outdated app is asked to update`() {
        show(MenuUiState(content = MenuContent.Failed(AppError.UpdateRequired)))
        seeText("Please update the app to keep ordering.")
    }

    @Test
    fun `the TEST MODE banner shows only when payments are simulated`() {
        show(ready.copy(testMode = true))
        compose.onNodeWithText("TEST MODE: payments are simulated. No real money is charged.").assertIsDisplayed()
    }

    @Test
    fun `no TEST MODE banner when payments are live`() {
        show(ready.copy(testMode = false))
        compose.onNodeWithText("TEST MODE: payments are simulated. No real money is charged.").assertDoesNotExist()
    }

    // ---------- the rest of the home page ----------

    private val site =
        SiteInfoDto(
            name = "Mustard Seed Restaurant & Bar",
            phoneWhatsapp = null,
            hours = HoursDto("08:00", "23:00", "22:30", "Africa/Lagos"),
            delivery = DeliveryDto(150_000, "Calabar"),
            branches =
                listOf(
                    BranchDto("calabar", "Calabar", "Cross River State", BranchDto.Role.HEADQUARTERS, null, true),
                    BranchDto(
                        "uyo",
                        "Uyo",
                        "Akwa Ibom State",
                        BranchDto.Role.BRANCH,
                        "97 Tunde Ukpehe (Mitama)",
                        false,
                    ),
                ),
        )

    @Test
    fun `the hero and how-it-works show the website's words and live facts`() {
        show(ready, extras = HomeExtras(site = site))
        seeText("The soul of Calabar,")
        seeText("served warm.")
        seeText("Open daily, 8am – 11pm")
        seeText("₦1,500 delivery anywhere in Calabar")
        seeText("Sign in with Google")
        seeText("Pay online, we start cooking")
    }

    @Test
    fun `visit us lists both branches with placeholders and online ordering status`() {
        show(ready, extras = HomeExtras(site = site))
        seeText("[CALABAR ADDRESS]")
        seeText("Online delivery and pickup available")
        seeText("97 Tunde Ukpehe (Mitama)")
        seeText("Online ordering coming soon")
        seeText("Online orders close at 10:30pm")
        seeText("[PHONE / WHATSAPP]")
    }

    @Test
    fun `tapping Add on a dish adds it, and on a soup opens the choices`() {
        val added = mutableListOf<String>()
        show(ready, extras = HomeExtras(onAdd = { added += it.name }))
        list().performScrollToNode(hasContentDescription("Choose options for Afang Soup"))
        compose.onNodeWithContentDescription("Choose options for Afang Soup").performClick()
        list().performScrollToNode(hasText("Drinks"))
        compose.onNodeWithText("Drinks").performClick()
        list().performScrollToNode(hasContentDescription("Add Zobo to your order"))
        compose.onNodeWithContentDescription("Add Zobo to your order").performClick()
        assertEquals(listOf("Afang Soup", "Zobo"), added)
    }

    @Test
    fun `the header shows the order count and who is signed in`() {
        var opened = 0
        show(
            ready,
            extras =
                HomeExtras(
                    cartCount = 3,
                    account = SignedInUser("u", "e@example.com", "Ekaette", "Ekaette Bassey", "customer"),
                    onOpenCart = { opened++ },
                ),
        )
        compose.onNodeWithContentDescription("Account: Ekaette").assertIsDisplayed()
        compose.onNodeWithContentDescription("Your order, 3 items").performClick()
        assertEquals(1, opened)
    }

    @Test
    fun `a signed-out visitor sees Sign in`() {
        show(ready)
        compose.onNodeWithContentDescription("Sign in").assertIsDisplayed()
    }
}
