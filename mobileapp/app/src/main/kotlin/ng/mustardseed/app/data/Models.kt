package ng.mustardseed.app.data

/** The app's own menu model, mapped from the generated API types. */
data class Menu(
    val categories: List<MenuCategory>,
)

data class MenuCategory(
    val id: String,
    val label: String,
    val items: List<MenuItem>,
)

data class MenuItem(
    val id: String,
    val name: String,
    val description: String,
    /** Whole kobo; null until the real price is supplied. */
    val priceKobo: Long?,
    val isHouseSignature: Boolean,
    val isFreshJuice: Boolean,
    val isAvailable: Boolean,
    /** Small image for lists; null shows the "Photo coming" placeholder. */
    val thumbnailUrl: String?,
    val optionGroups: List<OptionGroup>,
)

data class OptionGroup(
    val id: String,
    val name: String,
    val minChoices: Int,
    val maxChoices: Int,
    val options: List<Option>,
)

data class Option(
    val id: String,
    val name: String,
    val priceDeltaKobo: Long,
    val isAvailable: Boolean,
)

enum class PaymentMode { SIMULATED, LIVE }

/** The result of an API call: never an exception that could reach the screen (AGENT.md 7). */
sealed interface Outcome<out T> {
    data class Success<T>(
        val value: T,
    ) : Outcome<T>

    data class Failure(
        val error: AppError,
    ) : Outcome<Nothing>
}

/** Every failure the app can show, each with its own friendly message. */
sealed interface AppError {
    data object Offline : AppError

    data object Unreachable : AppError

    data object Timeout : AppError

    data object NotFound : AppError

    data object UpdateRequired : AppError

    /** 401: the session has ended; sign in again (the cart is kept). */
    data object SignInRequired : AppError

    /** 403: not allowed for this account. */
    data object Forbidden : AppError

    /**
     * 400, 409 or 422: the server refused the request and said why. Its message is shown when
     * present (e.g. "Zobo has just sold out."); field errors go next to their inputs.
     */
    data class Rejected(
        val status: Int,
        val code: String?,
        val message: String?,
        val fieldErrors: Map<String, List<String>>,
    ) : AppError

    data class RateLimited(
        val retryAfterSeconds: Int?,
    ) : AppError

    /** 5xx: shows the request id as a "Reference" line so support can trace it. */
    data class Server(
        val requestId: String?,
    ) : AppError

    data class Unknown(
        val requestId: String?,
    ) : AppError
}
