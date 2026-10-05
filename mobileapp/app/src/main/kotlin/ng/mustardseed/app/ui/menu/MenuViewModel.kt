package ng.mustardseed.app.ui.menu

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Menu
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.data.MenuRepository
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.data.PaymentMode

sealed interface MenuContent {
    data object Loading : MenuContent

    data class Ready(
        val menu: Menu,
    ) : MenuContent

    data class Failed(
        val error: AppError,
    ) : MenuContent
}

data class MenuUiState(
    val content: MenuContent = MenuContent.Loading,
    val selectedCategoryId: String? = null,
    /** Payments are simulated: show the TEST MODE banner. */
    val testMode: Boolean = false,
) {
    val visibleItems: List<MenuItem>
        get() =
            (content as? MenuContent.Ready)
                ?.menu
                ?.categories
                ?.firstOrNull { it.id == selectedCategoryId }
                ?.items
                .orEmpty()
}

class MenuViewModel(
    private val repository: MenuRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(MenuUiState())
    val state: StateFlow<MenuUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun retry() = load()

    fun selectCategory(id: String) = _state.update { it.copy(selectedCategoryId = id) }

    private fun load() {
        _state.update { it.copy(content = MenuContent.Loading) }
        viewModelScope.launch {
            // The banner is a nice-to-have: if the config call fails, the menu still shows.
            val mode = async { repository.paymentMode() }
            val menu = repository.menu()
            val testMode = (mode.await() as? Outcome.Success)?.value == PaymentMode.SIMULATED
            _state.update { current ->
                when (menu) {
                    is Outcome.Success -> {
                        current.copy(
                            content = MenuContent.Ready(menu.value),
                            selectedCategoryId =
                                current.selectedCategoryId
                                    ?.takeIf { id -> menu.value.categories.any { it.id == id } }
                                    ?: menu.value.categories
                                        .firstOrNull()
                                        ?.id,
                            testMode = testMode,
                        )
                    }

                    is Outcome.Failure -> {
                        current.copy(content = MenuContent.Failed(menu.error), testMode = testMode)
                    }
                }
            }
        }
    }
}
