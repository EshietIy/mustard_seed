package ng.mustardseed.app.ui.menu

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
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
    ) {
        compose.setContent {
            MustardSeedTheme {
                var current by remember { mutableStateOf(state) }
                MenuScreen(
                    state = current,
                    onRetry = onRetry,
                    onSelectCategory = { current = current.copy(selectedCategoryId = it) },
                )
            }
        }
    }

    private val ready =
        MenuUiState(content = MenuContent.Ready(sampleMenu()), selectedCategoryId = "calabar_classics")

    private fun list() = compose.onNodeWithTag("menu-list")

    @Test
    fun `the menu shows dishes with prices, placeholders, badges and sold-out items`() {
        show(ready)
        compose.onNodeWithText("From our pots to your table").assertIsDisplayed()
        compose.onNodeWithText("Calabar classics").assertIsDisplayed()
        list().performScrollToNode(hasText("House signature"))
        compose.onNodeWithText("House signature").assertIsDisplayed()
        list().performScrollToNode(hasText("[PRICE]"))
        compose.onNodeWithText("[PRICE]").assertIsDisplayed()
        list().performScrollToNode(hasText("₦4,500"))
        compose.onNodeWithText("Choose: Soup protein").assertExists()
        list().performScrollToNode(hasText("Sold out"))
        compose.onNodeWithText("Sold out").assertIsDisplayed()
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
        compose.onNodeWithText("Drinks").performClick()
        list().performScrollToNode(hasText("₦800"))
        compose.onNodeWithText("Zobo").assertExists()
        compose.onNodeWithText("₦800").assertIsDisplayed()
    }

    @Test
    fun `an empty category says more dishes are coming`() {
        show(ready)
        compose.onNodeWithText("Swallow & sides").performClick()
        list().performScrollToNode(hasText("More dishes are coming to this part of the menu soon."))
    }

    @Test
    fun `while loading, it says so`() {
        show(MenuUiState(content = MenuContent.Loading))
        compose.onNodeWithText("Loading the menu…").assertIsDisplayed()
    }

    @Test
    fun `a server failure explains it, shows a reference, and retries`() {
        var retries = 0
        show(MenuUiState(content = MenuContent.Failed(AppError.Server("ref-9"))), onRetry = { retries++ })
        compose.onNodeWithText("We couldn't load the menu.").assertIsDisplayed()
        compose.onNodeWithText("Something went wrong on our side. Please try again.").assertIsDisplayed()
        compose.onNodeWithText("Reference: ref-9").assertIsDisplayed()
        compose.onNodeWithText("Try again").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun `being offline is explained in plain words`() {
        show(MenuUiState(content = MenuContent.Failed(AppError.Offline)))
        compose.onNodeWithText("You appear to be offline. Check your connection and try again.").assertIsDisplayed()
    }

    @Test
    fun `an outdated app is asked to update`() {
        show(MenuUiState(content = MenuContent.Failed(AppError.UpdateRequired)))
        compose.onNodeWithText("Please update the app to keep ordering.").assertIsDisplayed()
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
}
