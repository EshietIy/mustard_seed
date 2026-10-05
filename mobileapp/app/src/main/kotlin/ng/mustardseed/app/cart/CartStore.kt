package ng.mustardseed.app.cart

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import ng.mustardseed.app.api.models.CartDto
import ng.mustardseed.app.api.models.CartLineInputDto
import ng.mustardseed.app.auth.SessionState
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.CartRepository
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.data.Outcome
import java.util.UUID

const val MAX_QUANTITY = 20

@Serializable
data class CartOption(
    val id: String,
    val name: String,
    val priceDeltaKobo: Long,
)

data class PriceChange(
    val fromKobo: Long,
    val toKobo: Long,
)

data class CartLine(
    /** The item plus its chosen options (just the item id when none). */
    val key: String,
    val itemId: String,
    val name: String,
    /** Price of one, including the options; null until the item has a price. */
    val unitPriceKobo: Long?,
    val quantity: Int,
    val isAvailable: Boolean,
    val options: List<CartOption>,
    /** What must be fixed before checkout, in the server's words. */
    val problems: List<String> = emptyList(),
    val priceChange: PriceChange? = null,
    /** The server's id for the line (signed in only). */
    val serverId: String? = null,
)

data class CartState(
    val lines: List<CartLine> = emptyList(),
    val signedIn: Boolean = false,
) {
    val count: Int get() = lines.sumOf { it.quantity }
    val isEmpty: Boolean get() = lines.isEmpty()

    /** null while any line has no price yet ([PRICE] placeholder). */
    val subtotalKobo: Long?
        get() =
            if (lines.any { it.unitPriceKobo == null }) {
                null
            } else {
                lines.sumOf { (it.unitPriceKobo ?: 0) * it.quantity }
            }

    /** Anything the customer must fix before checkout. */
    val hasProblems: Boolean
        get() = lines.any { !it.isAvailable || it.problems.isNotEmpty() || it.priceChange != null }
}

/** Things the screens should tell the customer about (as a snackbar). */
sealed interface CartMessage {
    data class Failed(
        val error: AppError,
    ) : CartMessage

    /** Some device-cart items couldn't be added to the saved cart at sign-in. */
    data object SomeLeftOut : CartMessage
}

fun lineKey(
    itemId: String,
    optionIds: List<String>,
): String = if (optionIds.isEmpty()) itemId else (listOf(itemId) + optionIds.sorted()).joinToString("|")

// ---------- device storage for a guest's cart ----------

@Serializable
data class StoredLine(
    val itemId: String,
    val name: String,
    val basePriceKobo: Long?,
    val quantity: Int,
    val isAvailable: Boolean,
    val options: List<CartOption>,
)

interface GuestCartStorage {
    fun read(): List<StoredLine>

    fun write(lines: List<StoredLine>)
}

class InMemoryGuestCartStorage : GuestCartStorage {
    private var lines: List<StoredLine> = emptyList()

    override fun read() = lines

    override fun write(lines: List<StoredLine>) {
        this.lines = lines
    }
}

/** A guest's cart in private app storage. It holds no secrets. */
class PrefsGuestCartStorage(
    context: Context,
) : GuestCartStorage {
    private val prefs = context.getSharedPreferences("msd_guest_cart", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(StoredLine.serializer())

    override fun read(): List<StoredLine> =
        try {
            prefs.getString("lines", null)?.let { json.decodeFromString(serializer, it) }.orEmpty()
        } catch (e: Exception) {
            emptyList()
        }

    override fun write(lines: List<StoredLine>) {
        prefs.edit { putString("lines", json.encodeToString(serializer, lines)) }
    }
}

// ---------- the store ----------

/**
 * The order in progress, shared by every screen. A guest's cart lives on the device; once signed
 * in it is the saved server cart (AGENT.md section 13), and the device cart is merged into it
 * once. Same rules as the website.
 */
class CartStore(
    session: StateFlow<SessionState>,
    private val repo: CartRepository,
    private val storage: GuestCartStorage,
    scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(CartState(lines = storage.read().map(::fromStored)))
    val state: StateFlow<CartState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<CartMessage>(extraBufferCapacity = 8)
    val messages: SharedFlow<CartMessage> = _messages.asSharedFlow()

    private val lock = Mutex()

    init {
        scope.launch {
            session.collect { state ->
                when (state) {
                    is SessionState.SignedIn -> if (!_state.value.signedIn) useServerCart()
                    SessionState.SignedOut -> if (_state.value.signedIn) _state.value = CartState()
                }
            }
        }
    }

    private fun find(key: String) = _state.value.lines.find { it.key == key }

    /** Adds one of the item with these choices. False if sold out, at the limit, or refused. */
    suspend fun add(
        item: MenuItem,
        optionIds: List<String> = emptyList(),
    ): Boolean {
        if (!item.isAvailable) return false
        val line = find(lineKey(item.id, optionIds))
        if (line != null && line.quantity >= MAX_QUANTITY) return false
        return setQuantityOf(item, optionIds, (line?.quantity ?: 0) + 1)
    }

    /** True when the cart already holds the most allowed of the item with these choices. */
    fun atLimit(
        itemId: String,
        optionIds: List<String> = emptyList(),
    ): Boolean = (find(lineKey(itemId, optionIds))?.quantity ?: 0) >= MAX_QUANTITY

    /** Makes sure the cart holds at least [quantity] (used by Order again; never doubles). */
    suspend fun ensure(
        item: MenuItem,
        optionIds: List<String>,
        quantity: Int,
    ): Boolean {
        if (!item.isAvailable) return false
        val wanted = quantity.coerceAtMost(MAX_QUANTITY)
        val line = find(lineKey(item.id, optionIds))
        if (line != null && line.quantity >= wanted) return true
        return setQuantityOf(item, optionIds, wanted)
    }

    suspend fun increment(key: String) {
        val line = find(key) ?: return
        if (line.isAvailable && line.quantity < MAX_QUANTITY) setQuantity(line, line.quantity + 1)
    }

    suspend fun decrement(key: String) {
        val line = find(key) ?: return
        setQuantity(line, line.quantity - 1)
    }

    suspend fun remove(key: String) {
        val line = find(key) ?: return
        setQuantity(line, 0)
    }

    /** Accepts a changed price by setting the line again at the same quantity. */
    suspend fun acceptPrice(key: String) {
        val line = find(key) ?: return
        setQuantity(line, line.quantity)
    }

    /** Reloads the saved cart (on open, on return, before checkout, after payment). */
    suspend fun refresh() {
        if (_state.value.signedIn) server { repo.get() }
    }

    private suspend fun setQuantityOf(
        item: MenuItem,
        optionIds: List<String>,
        quantity: Int,
    ): Boolean {
        if (_state.value.signedIn) return server { repo.setLine(item.id, optionIds.sorted(), quantity) }
        val options =
            item.optionGroups
                .flatMap { it.options }
                .filter { it.id in optionIds }
                .map { CartOption(it.id, it.name, it.priceDeltaKobo) }
        val key = lineKey(item.id, optionIds)
        val existing = find(key)
        val updated =
            existing?.copy(quantity = quantity)
                ?: CartLine(
                    key = key,
                    itemId = item.id,
                    name = item.name,
                    unitPriceKobo = item.priceKobo?.let { base -> base + options.sumOf { it.priceDeltaKobo } },
                    quantity = quantity,
                    isAvailable = true,
                    options = options,
                )
        saveGuest(
            if (existing ==
                null
            ) {
                _state.value.lines + updated
            } else {
                _state.value.lines.map { if (it.key == key) updated else it }
            },
        )
        return true
    }

    private suspend fun setQuantity(
        line: CartLine,
        quantity: Int,
    ) {
        if (_state.value.signedIn) {
            if (quantity < 1) {
                line.serverId?.let { id -> server { repo.deleteLine(id) } }
            } else {
                server { repo.setLine(line.itemId, line.options.map { it.id }, quantity) }
            }
            return
        }
        saveGuest(
            if (quantity < 1) {
                _state.value.lines.filterNot { it.key == line.key }
            } else {
                _state.value.lines.map { if (it.key == line.key) it.copy(quantity = quantity) else it }
            },
        )
    }

    private suspend fun server(call: suspend () -> Outcome<CartDto>): Boolean =
        lock.withLock {
            when (val outcome = call()) {
                is Outcome.Success -> {
                    _state.update { it.copy(lines = fromServer(outcome.value), signedIn = true) }
                    true
                }

                is Outcome.Failure -> {
                    if (outcome.error !is AppError.SignInRequired) _messages.tryEmit(CartMessage.Failed(outcome.error))
                    false
                }
            }
        }

    private suspend fun useServerCart() {
        val guest = _state.value.lines
        _state.update { it.copy(signedIn = true) }
        if (guest.isEmpty()) {
            server { repo.get() }
            return
        }
        val outcome =
            repo.merge(
                guest.map { line ->
                    CartLineInputDto(
                        UUID.fromString(line.itemId),
                        line.quantity.toLong(),
                        line.options.map { UUID.fromString(it.id) },
                    )
                },
            )
        when (outcome) {
            is Outcome.Success -> {
                _state.update { it.copy(lines = fromServer(outcome.value.cart)) }
                storage.write(emptyList())
                if (outcome.value.skipped > 0) _messages.tryEmit(CartMessage.SomeLeftOut)
            }

            is Outcome.Failure -> {
                // Keep the device cart; it is merged on the next sign-in.
                _state.value = CartState(lines = guest)
                _messages.tryEmit(CartMessage.Failed(outcome.error))
            }
        }
    }

    private fun saveGuest(lines: List<CartLine>) {
        _state.update { it.copy(lines = lines) }
        storage.write(
            lines.map {
                StoredLine(
                    itemId = it.itemId,
                    name = it.name,
                    basePriceKobo = it.unitPriceKobo?.let { unit -> unit - it.options.sumOf { o -> o.priceDeltaKobo } },
                    quantity = it.quantity,
                    isAvailable = it.isAvailable,
                    options = it.options,
                )
            },
        )
    }
}

private fun fromStored(line: StoredLine) =
    CartLine(
        key = lineKey(line.itemId, line.options.map { it.id }),
        itemId = line.itemId,
        name = line.name,
        unitPriceKobo = line.basePriceKobo?.let { base -> base + line.options.sumOf { it.priceDeltaKobo } },
        quantity = line.quantity.coerceIn(1, MAX_QUANTITY),
        isAvailable = line.isAvailable,
        options = line.options,
    )

private fun fromServer(cart: CartDto): List<CartLine> =
    cart.lines.map { l ->
        CartLine(
            key = lineKey(l.menuItemId.toString(), l.optionIds),
            itemId = l.menuItemId.toString(),
            name = l.name,
            unitPriceKobo = l.unitPriceKobo,
            quantity = l.quantity.toInt(),
            isAvailable = l.isAvailable,
            options = l.options.map { CartOption(it.id.toString(), it.name, it.priceDeltaKobo) },
            problems = l.problems.map { it.message },
            priceChange = l.priceChange?.let { PriceChange(it.fromKobo, it.toKobo) },
            serverId = l.id.toString(),
        )
    }
