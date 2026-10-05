package ng.mustardseed.app.testing

import ng.mustardseed.app.data.AppError
import ng.mustardseed.app.data.Menu
import ng.mustardseed.app.data.MenuCategory
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.data.MenuRepository
import ng.mustardseed.app.data.Option
import ng.mustardseed.app.data.OptionGroup
import ng.mustardseed.app.data.Outcome
import ng.mustardseed.app.data.PaymentMode

fun item(
    name: String,
    priceKobo: Long? = 450_000,
    isAvailable: Boolean = true,
    isHouseSignature: Boolean = false,
    optionGroups: List<OptionGroup> = emptyList(),
) = MenuItem(
    id = name.lowercase().replace(' ', '-'),
    name = name,
    description = "$name description.",
    priceKobo = priceKobo,
    isHouseSignature = isHouseSignature,
    isFreshJuice = false,
    isAvailable = isAvailable,
    thumbnailUrl = null,
    optionGroups = optionGroups,
)

val protein =
    OptionGroup(
        id = "g-protein",
        name = "Soup protein",
        minChoices = 1,
        maxChoices = 1,
        options = listOf(Option("o-chicken", "Chicken", 50_000, true)),
    )

fun sampleMenu() =
    Menu(
        categories =
            listOf(
                MenuCategory(
                    "calabar_classics",
                    "Calabar classics",
                    listOf(
                        item("Edikang Ikong", priceKobo = null, isHouseSignature = true),
                        item("Afang Soup", optionGroups = listOf(protein)),
                        item("Atama Soup", isAvailable = false),
                    ),
                ),
                MenuCategory("swallow_sides", "Swallow & sides", emptyList()),
                MenuCategory("drinks", "Drinks", listOf(item("Zobo", priceKobo = 80_000))),
            ),
    )

/** A MenuRepository whose answers each test sets up; counts calls for retry checks. */
class FakeMenuRepository(
    var menuAnswers: MutableList<Outcome<Menu>> = mutableListOf(Outcome.Success(sampleMenu())),
    var modeAnswer: Outcome<PaymentMode> = Outcome.Success(PaymentMode.LIVE),
) : MenuRepository {
    var menuCalls = 0

    override suspend fun menu(): Outcome<Menu> {
        menuCalls += 1
        return if (menuAnswers.size > 1) menuAnswers.removeAt(0) else menuAnswers.first()
    }

    override suspend fun paymentMode(): Outcome<PaymentMode> = modeAnswer
}

val serverDown: Outcome<Menu> = Outcome.Failure(AppError.Server(requestId = "ref-9"))
