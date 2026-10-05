package ng.mustardseed.app.ui.menu

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.data.PaymentMode
import ng.mustardseed.app.testing.FakeMenuRepository
import ng.mustardseed.app.testing.sampleMenu
import ng.mustardseed.app.testing.serverDown
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MenuViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `starts loading, then shows the menu with the first category selected`() =
        runTest(dispatcher) {
            val vm = MenuViewModel(FakeMenuRepository())
            assertEquals(MenuContent.Loading, vm.state.value.content)
            advanceUntilIdle()
            assertEquals(MenuContent.Ready(sampleMenu()), vm.state.value.content)
            assertEquals("calabar_classics", vm.state.value.selectedCategoryId)
            assertFalse(vm.state.value.testMode)
        }

    @Test
    fun `shows the test mode banner when payments are simulated`() =
        runTest(dispatcher) {
            val vm = MenuViewModel(FakeMenuRepository(modeAnswer = Outcome.Success(PaymentMode.SIMULATED)))
            advanceUntilIdle()
            assertTrue(vm.state.value.testMode)
        }

    @Test
    fun `still shows the menu when the config call fails`() =
        runTest(dispatcher) {
            val vm = MenuViewModel(FakeMenuRepository(modeAnswer = Outcome.Failure(AppError.Unreachable)))
            advanceUntilIdle()
            assertTrue(vm.state.value.content is MenuContent.Ready)
            assertFalse(vm.state.value.testMode)
        }

    @Test
    fun `a failure shows the error, and retrying loads the menu`() =
        runTest(dispatcher) {
            val repo = FakeMenuRepository(menuAnswers = mutableListOf(serverDown, Outcome.Success(sampleMenu())))
            val vm = MenuViewModel(repo)
            advanceUntilIdle()
            assertEquals(MenuContent.Failed(AppError.Server("ref-9")), vm.state.value.content)
            vm.retry()
            assertEquals(MenuContent.Loading, vm.state.value.content)
            advanceUntilIdle()
            assertTrue(vm.state.value.content is MenuContent.Ready)
            assertEquals(2, repo.menuCalls)
        }

    @Test
    fun `selecting a category switches the list`() =
        runTest(dispatcher) {
            val vm = MenuViewModel(FakeMenuRepository())
            advanceUntilIdle()
            vm.selectCategory("drinks")
            assertEquals("drinks", vm.state.value.selectedCategoryId)
            assertEquals(
                listOf("Zobo"),
                vm.state.value.visibleItems
                    .map { it.name },
            )
        }
}
