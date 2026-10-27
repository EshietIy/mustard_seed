package ng.mustardseed.app.cart

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
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
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(CartState(lines = storage.read().map(::fromStored)))
    val state: StateFlow<CartState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<CartMessage>(extraBufferCapacity = 8)
    val messages: SharedFlow<CartMessage> = _messages.asSharedFlow()

    /*
     * Signed in, a change shows at once and is saved in the background, so the + and − buttons
     * never wait for the network. Each line sends one request at a time, always with the newest
     * quantity: quick taps are never lost and make at most two requests. Same as the website.
     * Everything below is used from the main thread only (the app scope and the screens).
     */

    /** The cart as the server last returned it. */
    private var saved: List<CartLine> = emptyList()

    /** Changes not yet confirmed, by line key; quantity 0 removes the line. */
    private val unsaved = mutableMapOf<String, CartLine>()

    /** The running save for each line. */
    private val saving = mutableMapOf<String, Deferred<Boolean>>()

    /** Bumped on sign-out, so late answers about an old cart are ignored. */
    private var generation = 0

    init {
        scope.launch {
            session.collect { state ->
                when (state) {
                    is SessionState.SignedIn -> {
                        if (!_state.value.signedIn) useServerCart()
                    }

                    SessionState.SignedOut -> {
                        if (_state.value.signedIn) {
                            forget()
                            _state.value = CartState()
                        }
                    }
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
        if (!_state.value.signedIn) return
        // Changes still being saved go first, so the reload (and checkout) sees them.
        settled()
        server { repo.get() }
    }

    /** Waits for every change to reach the server. */
    private suspend fun settled() {
        while (saving.isNotEmpty()) saving.values.toList().awaitAll()
    }

    private suspend fun setQuantityOf(
        item: MenuItem,
        optionIds: List<String>,
        quantity: Int,
    ): Boolean {
        val key = lineKey(item.id, optionIds)
        val existing = find(key)
        if (_state.value.signedIn) return change(existing ?: newLine(item, optionIds), quantity)
        val updated = (existing ?: newLine(item, optionIds)).copy(quantity = quantity)
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
            change(line, quantity.coerceAtLeast(0))
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

    /** A line for an item not yet in the cart (details for display; the server prices it). */
    private fun newLine(
        item: MenuItem,
        optionIds: List<String>,
    ): CartLine {
        val options =
            item.optionGroups
                .flatMap { it.options }
                .filter { it.id in optionIds }
                .map { CartOption(it.id, it.name, it.priceDeltaKobo) }
        return CartLine(
            key = lineKey(item.id, optionIds),
            itemId = item.id,
            name = item.name,
            unitPriceKobo = item.priceKobo?.let { base -> base + options.sumOf { it.priceDeltaKobo } },
            quantity = 0,
            isAvailable = true,
            options = options,
        )
    }

    /** The saved cart with the unsaved changes on top. */
    private fun show() {
        val shown =
            saved
                .map { line -> unsaved[line.key]?.let { line.copy(quantity = it.quantity) } ?: line }
                .filter { it.quantity > 0 }
                .toMutableList()
        unsaved.values
            .filter { change -> change.quantity > 0 && saved.none { it.key == change.key } }
            .forEach { shown += it }
        _state.update { it.copy(lines = shown) }
    }

    private fun useSaved(cart: CartDto) {
        saved = fromServer(cart)
        show()
    }

    private fun forget() {
        generation += 1
        saved = emptyList()
        unsaved.clear()
        saving.clear()
    }

    private fun failed(error: AppError) {
        if (error !is AppError.SignInRequired) _messages.tryEmit(CartMessage.Failed(error))
    }

    /** Shows the new quantity now and saves it (0 removes the line). False if refused. */
    private suspend fun change(
        line: CartLine,
        quantity: Int,
    ): Boolean {
        unsaved[line.key] = line.copy(quantity = quantity)
        show()
        return save(line.key).await()
    }

    /** Saves the newest quantity of one line, then any change made meanwhile. */
    private fun save(key: String): Deferred<Boolean> {
        saving[key]?.let { return it }
        val started = generation
        var run: Deferred<Boolean>? = null
        run =
            scope.async(start = CoroutineStart.LAZY) {
                try {
                    var ok = true
                    while (true) {
                        val change = unsaved[key] ?: break
                        val quantity = change.quantity
                        val serverId = saved.find { it.key == key }?.serverId
                        if (quantity < 1 && serverId == null) {
                            unsaved.remove(key)
                            show()
                            break
                        }
                        val outcome =
                            if (quantity < 1 && serverId != null) {
                                repo.deleteLine(serverId)
                            } else {
                                repo.setLine(change.itemId, change.options.map { it.id }.sorted(), quantity)
                            }
                        if (started != generation) return@async false
                        when (outcome) {
                            is Outcome.Success -> {
                                if (unsaved[key]?.quantity == quantity) unsaved.remove(key)
                                saved = fromServer(outcome.value)
                                ok = true
                            }

                            is Outcome.Failure -> {
                                // The line goes back to what the server has; the reason is shown.
                                unsaved.remove(key)
                                failed(outcome.error)
                                ok = false
                            }
                        }
                        show()
                    }
                    ok
                } finally {
                    if (saving[key] === run) saving.remove(key)
                }
            }
        saving[key] = run
        run.start()
        return run
    }

    /** Runs a whole-cart server call; on failure the cart is unchanged and the reason is shown. */
    private suspend fun server(call: suspend () -> Outcome<CartDto>): Boolean {
        val started = generation
        return when (val outcome = call()) {
            is Outcome.Success -> {
                if (started == generation) useSaved(outcome.value)
                true
            }

            is Outcome.Failure -> {
                failed(outcome.error)
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
                useSaved(outcome.value.cart)
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
