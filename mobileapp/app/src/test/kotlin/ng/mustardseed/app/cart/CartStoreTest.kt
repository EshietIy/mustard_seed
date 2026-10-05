package ng.mustardseed.app.cart

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import ng.mustardseed.app.api.models.CartDto
import ng.mustardseed.app.api.models.CartLineDto
import ng.mustardseed.app.api.models.CartLineInputDto
import ng.mustardseed.app.api.models.CartLineOptionDto
import ng.mustardseed.app.api.models.CartLineProblemDto
import ng.mustardseed.app.api.models.MergedCartDto
import ng.mustardseed.app.api.models.PriceChangeDto
import ng.mustardseed.app.auth.SessionState
import ng.mustardseed.app.auth.SignedInUser
import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.CartRepository
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.testing.item
import ng.mustardseed.app.testing.protein
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

private val ZOBO_ID = UUID.fromString("00000000-0000-4000-8000-0000000000aa")
private val SOUP_ID = UUID.fromString("00000000-0000-4000-8000-0000000000bb")
private val CHICKEN_ID = UUID.fromString("00000000-0000-4000-8000-0000000000cc")

private val zobo = item("Zobo", priceKobo = 80_000).copy(id = ZOBO_ID.toString())
private val soup =
    item(
        "Afang Soup",
        priceKobo = 400_000,
        optionGroups =
            listOf(
                protein.copy(
                    options =
                        protein.options.map {
                            it.copy(id = CHICKEN_ID.toString())
                        },
                ),
            ),
    ).copy(id = SOUP_ID.toString())

private val user = SignedInUser("u", "e@example.com", "Ekaette", "Ekaette Bassey", "customer")

private fun line(
    id: String = "00000000-0000-4000-8000-000000000001",
    item: UUID = ZOBO_ID,
    name: String = "Zobo",
    quantity: Long = 2,
    unit: Long? = 80_000,
    options: List<CartLineOptionDto> = emptyList(),
    problems: List<CartLineProblemDto> = emptyList(),
    priceChange: PriceChangeDto? = null,
    isAvailable: Boolean = true,
) = CartLineDto(
    id = UUID.fromString(id),
    menuItemId = item,
    name = name,
    optionIds = options.map { it.id.toString() },
    options = options,
    quantity = quantity,
    unitPriceKobo = unit,
    lineTotalKobo = unit?.times(quantity),
    isAvailable = isAvailable,
    problems = problems,
    priceChange = priceChange,
)

private fun cart(vararg lines: CartLineDto) =
    CartDto(lines.toList(), lines.sumOf { it.quantity }, lines.sumOf { it.lineTotalKobo ?: 0 }, lines.isNotEmpty())

/** A fake saved cart that records calls and answers with whatever the test sets. */
private class FakeCartRepository(
    var answer: Outcome<CartDto> = Outcome.Success(cart()),
) : CartRepository {
    val calls = mutableListOf<String>()
    var merged: List<CartLineInputDto>? = null
    var mergeSkipped = 0L

    override suspend fun get() = answer.also { calls += "get" }

    override suspend fun setLine(
        menuItemId: String,
        optionIds: List<String>,
        quantity: Int,
    ) = answer.also { calls += "set $menuItemId $optionIds $quantity" }

    override suspend fun deleteLine(lineId: String) = answer.also { calls += "delete $lineId" }

    override suspend fun clear() = answer.also { calls += "clear" }

    override suspend fun merge(lines: List<CartLineInputDto>): Outcome<MergedCartDto> {
        merged = lines
        calls += "merge"
        return when (val a = answer) {
            is Outcome.Success -> Outcome.Success(MergedCartDto(a.value, mergeSkipped))
            is Outcome.Failure -> a
        }
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class CartStoreTest {
    private val session = MutableStateFlow<SessionState>(SessionState.SignedOut)
    private val storage = InMemoryGuestCartStorage()
    private val repo = FakeCartRepository()

    private fun TestScope.scope() = CoroutineScope(UnconfinedTestDispatcher(testScheduler))

    private fun TestScope.store() = CartStore(session, repo, storage, scope())

    // ---------- guest (device cart) ----------

    @Test
    fun `a guest's cart is kept on the device`() =
        runTest {
            val cart = store()
            assertTrue(cart.add(zobo))
            assertTrue(cart.add(zobo))
            assertEquals(
                listOf(2),
                cart.state.value.lines
                    .map { it.quantity },
            )
            assertEquals(160_000L, cart.state.value.subtotalKobo)
            assertEquals(1, storage.read().size)
            assertEquals(2, CartStore(session, repo, storage, scope()).state.value.count)
        }

    @Test
    fun `the same soup with different choices is two lines, priced with the options`() =
        runTest {
            val cart = store()
            cart.add(soup, listOf(CHICKEN_ID.toString()))
            cart.add(soup, listOf(CHICKEN_ID.toString()))
            assertEquals(
                listOf(2),
                cart.state.value.lines
                    .map { it.quantity },
            )
            assertEquals(2 * 450_000L, cart.state.value.subtotalKobo)
        }

    @Test
    fun `sold-out items can't be added`() =
        runTest {
            assertFalse(store().add(zobo.copy(isAvailable = false)))
        }

    @Test
    fun `adding stops at the limit, and the limit is reported per choice`() =
        runTest {
            val cart = store()
            repeat(MAX_QUANTITY) { assertTrue(cart.add(soup, listOf(CHICKEN_ID.toString()))) }
            assertTrue(cart.atLimit(soup.id, listOf(CHICKEN_ID.toString())))
            assertFalse(cart.add(soup, listOf(CHICKEN_ID.toString())))
            assertFalse(cart.atLimit(soup.id))
            assertEquals(MAX_QUANTITY, cart.state.value.count)
        }

    @Test
    fun `ensure never adds on top of what is there`() =
        runTest {
            val cart = store()
            cart.ensure(zobo, emptyList(), 2)
            cart.ensure(zobo, emptyList(), 1)
            assertEquals(
                listOf(2),
                cart.state.value.lines
                    .map { it.quantity },
            )
        }

    // ---------- signed in (server cart) ----------

    @Test
    fun `after sign-in the saved cart is used`() =
        runTest {
            repo.answer = Outcome.Success(cart(line()))
            val cart = store()
            session.value = SessionState.SignedIn(user)
            assertEquals(listOf("get"), repo.calls)
            assertEquals(
                listOf("Zobo" to 2),
                cart.state.value.lines
                    .map { it.name to it.quantity },
            )
        }

    @Test
    fun `the device cart is merged into the saved cart on sign-in, then forgotten`() =
        runTest {
            val cart = store()
            cart.add(zobo)
            repo.answer = Outcome.Success(cart(line(quantity = 1)))
            repo.mergeSkipped = 1
            val messages = mutableListOf<CartMessage>()
            val collector = scope().launchCollect(cart, messages)
            session.value = SessionState.SignedIn(user)
            assertEquals(listOf(CartLineInputDto(ZOBO_ID, 1, emptyList())), repo.merged)
            assertTrue(storage.read().isEmpty())
            assertEquals(listOf<CartMessage>(CartMessage.SomeLeftOut), messages)
            collector.cancel()
        }

    @Test
    fun `adding sets the new quantity on the server`() =
        runTest {
            repo.answer = Outcome.Success(cart(line()))
            val cart = store()
            session.value = SessionState.SignedIn(user)
            repo.answer = Outcome.Success(cart(line(quantity = 3)))
            assertTrue(cart.add(zobo))
            assertEquals("set $ZOBO_ID [] 3", repo.calls.last())
            assertEquals(
                3,
                cart.state.value.lines
                    .single()
                    .quantity,
            )
        }

    @Test
    fun `going to zero removes the line on the server`() =
        runTest {
            repo.answer = Outcome.Success(cart(line(quantity = 1)))
            val cart = store()
            session.value = SessionState.SignedIn(user)
            repo.answer = Outcome.Success(cart())
            cart.decrement(
                cart.state.value.lines
                    .single()
                    .key,
            )
            assertEquals("delete 00000000-0000-4000-8000-000000000001", repo.calls.last())
            assertTrue(cart.state.value.isEmpty)
        }

    @Test
    fun `a price change is flagged and accepted by setting the line again`() =
        runTest {
            repo.answer = Outcome.Success(cart(line(unit = 90_000, priceChange = PriceChangeDto(80_000, 90_000))))
            val cart = store()
            session.value = SessionState.SignedIn(user)
            assertEquals(
                PriceChange(80_000, 90_000),
                cart.state.value.lines
                    .single()
                    .priceChange,
            )
            assertTrue(cart.state.value.hasProblems)
            repo.answer = Outcome.Success(cart(line(unit = 90_000)))
            cart.acceptPrice(
                cart.state.value.lines
                    .single()
                    .key,
            )
            assertEquals("set $ZOBO_ID [] 2", repo.calls.last())
            assertFalse(cart.state.value.hasProblems)
        }

    @Test
    fun `server problems are shown in words and block checkout`() =
        runTest {
            repo.answer =
                Outcome.Success(
                    cart(
                        line(
                            isAvailable = false,
                            problems = listOf(CartLineProblemDto("ITEM_UNAVAILABLE", "Zobo has just sold out.")),
                        ),
                    ),
                )
            val cart = store()
            session.value = SessionState.SignedIn(user)
            assertEquals(
                listOf("Zobo has just sold out."),
                cart.state.value.lines
                    .single()
                    .problems,
            )
            assertTrue(cart.state.value.hasProblems)
        }

    @Test
    fun `a refused change keeps the cart and explains`() =
        runTest {
            repo.answer = Outcome.Success(cart(line()))
            val cart = store()
            session.value = SessionState.SignedIn(user)
            val messages = mutableListOf<CartMessage>()
            val collector = scope().launchCollect(cart, messages)
            val refused = AppError.Rejected(422, "ITEM_UNAVAILABLE", "Zobo has just sold out.", emptyMap())
            repo.answer = Outcome.Failure(refused)
            assertFalse(cart.add(zobo))
            assertEquals(
                2,
                cart.state.value.lines
                    .single()
                    .quantity,
            )
            assertEquals(listOf<CartMessage>(CartMessage.Failed(refused)), messages)
            collector.cancel()
        }

    @Test
    fun `signing out leaves an empty device cart`() =
        runTest {
            repo.answer = Outcome.Success(cart(line()))
            val cart = store()
            session.value = SessionState.SignedIn(user)
            session.value = SessionState.SignedOut
            assertTrue(cart.state.value.isEmpty)
            assertNull(
                cart.state.value.lines
                    .firstOrNull(),
            )
        }
}

private fun CoroutineScope.launchCollect(
    cart: CartStore,
    into: MutableList<CartMessage>,
) = launch { cart.messages.collect { into += it } }
