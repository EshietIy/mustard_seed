package ng.mustardseed.app.data

import ng.mustardseed.app.api.models.MenuDto
import ng.mustardseed.app.api.models.PublicConfigDto

interface MenuRepository {
    suspend fun menu(): Outcome<Menu>

    /** Whether payments are simulated, for the TEST MODE banner. */
    suspend fun paymentMode(): Outcome<PaymentMode>
}

class ApiMenuRepository(
    private val api: ApiFactory,
    private val isOnline: () -> Boolean,
) : MenuRepository {
    override suspend fun menu(): Outcome<Menu> = apiCall(isOnline, { api.menu.menuControllerGetV1() }, ::toMenu)

    override suspend fun paymentMode(): Outcome<PaymentMode> =
        apiCall(isOnline, { api.config.configPublicControllerGetV1() }) { config ->
            when (config.paymentMode) {
                PublicConfigDto.PaymentMode.SIMULATED -> PaymentMode.SIMULATED
                PublicConfigDto.PaymentMode.LIVE -> PaymentMode.LIVE
            }
        }
}

private fun toMenu(dto: MenuDto): Menu =
    Menu(
        categories =
            dto.categories.map { category ->
                MenuCategory(
                    id = category.id.value,
                    label = category.label,
                    items =
                        category.items.map { item ->
                            MenuItem(
                                id = item.id.toString(),
                                name = item.name,
                                description = item.description,
                                priceKobo = item.priceKobo,
                                isHouseSignature = item.isHouseSignature,
                                isFreshJuice = item.isFreshJuice,
                                isAvailable = item.isAvailable,
                                thumbnailUrl = item.image?.thumbnailUrl,
                                optionGroups =
                                    item.optionGroups.map { group ->
                                        OptionGroup(
                                            id = group.id.toString(),
                                            name = group.name,
                                            minChoices = group.minChoices.toInt(),
                                            maxChoices = group.maxChoices.toInt(),
                                            options =
                                                group.options.map { option ->
                                                    Option(
                                                        id = option.id.toString(),
                                                        name = option.name,
                                                        priceDeltaKobo = option.priceDeltaKobo,
                                                        isAvailable = option.isAvailable,
                                                    )
                                                },
                                        )
                                    },
                            )
                        },
                )
            },
    )
