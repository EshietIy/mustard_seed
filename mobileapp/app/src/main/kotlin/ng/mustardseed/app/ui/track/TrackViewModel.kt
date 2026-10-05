package ng.mustardseed.app.ui.track

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.FINAL_STATUSES
import ng.mustardseed.app.data.OrderView
import ng.mustardseed.app.data.OrdersRepository
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.data.toView

const val TRACK_REFRESH_MS = 20_000L

data class TrackUiState(
    val order: OrderView? = null,
    val loadError: AppError? = null,
    /** A background refresh failed; the last known order stays on screen. */
    val refreshFailed: Boolean = false,
)

/** The live status page from the email link: refreshes every 20s until a final status. */
class TrackViewModel(
    private val token: String,
    private val orders: OrdersRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TrackUiState())
    val state: StateFlow<TrackUiState> = _state.asStateFlow()
    private var job: Job? = null

    init {
        load()
    }

    fun load() {
        job?.cancel()
        job =
            viewModelScope.launch {
                _state.update { it.copy(loadError = null) }
                while (true) {
                    var wait = TRACK_REFRESH_MS
                    when (val outcome = orders.track(token)) {
                        is Outcome.Success -> {
                            _state.update { it.copy(order = outcome.value.toView(), refreshFailed = false) }
                        }

                        is Outcome.Failure -> {
                            if (_state.value.order == null) {
                                _state.update { it.copy(loadError = outcome.error) }
                                return@launch
                            }
                            _state.update { it.copy(refreshFailed = true) }
                            (outcome.error as? AppError.RateLimited)?.retryAfterSeconds?.let { wait = it * 1000L }
                        }
                    }
                    if (_state.value.order?.status in FINAL_STATUSES) return@launch
                    delay(wait)
                }
            }
    }
}
