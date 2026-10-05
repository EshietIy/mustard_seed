package ng.mustardseed.app.ui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.launch
import ng.mustardseed.app.R
import ng.mustardseed.app.api.models.BranchDto
import ng.mustardseed.app.api.models.SiteInfoDto
import ng.mustardseed.app.auth.SignedInUser
import ng.mustardseed.app.data.MenuCategory
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.ui.components.ErrorState
import ng.mustardseed.app.ui.components.PhotoPlaceholder
import ng.mustardseed.app.ui.components.TestModeBanner
import ng.mustardseed.app.ui.components.ZigzagTrim
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.formatClock
import ng.mustardseed.app.util.formatNaira
import ng.mustardseed.app.util.priceLabel

private val CardShape = RoundedCornerShape(16.dp)
private val PillShape = RoundedCornerShape(50)

/** Everything the home page needs besides the menu state; defaults keep previews and tests simple. */
data class HomeExtras(
    val site: SiteInfoDto? = null,
    val cartCount: Int = 0,
    val account: SignedInUser? = null,
    val onAdd: (MenuItem) -> Unit = {},
    val onOpenCart: () -> Unit = {},
    val onAccount: () -> Unit = {},
)

/**
 * The home page (docs/landing-page.pdf): header, hero, how it works, today's menu, fresh juices,
 * our story, visit us and the footer. Loading and errors sit where the menu is, so the rest of
 * the page still shows.
 */
@Composable
fun MenuScreen(
    state: MenuUiState,
    onRetry: () -> Unit,
    onSelectCategory: (String) -> Unit,
    modifier: Modifier = Modifier,
    extras: HomeExtras = HomeExtras(),
) {
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize().background(Brand.Cream)) {
        if (state.testMode) TestModeBanner()
        HomeHeader(extras)
        LazyColumn(
            state = list,
            modifier = Modifier.fillMaxSize().testTag("menu-list"),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(key = "hero") {
                Hero(extras.site) { scope.launch { list.animateScrollToItem(MENU_HEADER_INDEX) } }
            }
            item(key = "steps") { Steps() }
            menuSection(state, onRetry, onSelectCategory, extras.onAdd)
            val juices =
                (state.content as? MenuContent.Ready)
                    ?.menu
                    ?.categories
                    .orEmpty()
                    .flatMap {
                        it.items
                    }.filter { it.isFreshJuice }
            if (juices.isNotEmpty()) item(key = "juices") { Juices(juices, extras.onAdd) }
            item(key = "story") { Story() }
            item(key = "visit") { Visit(extras.site) }
            item(key = "footer") { Footer(extras.site) }
        }
    }
}

private const val MENU_HEADER_INDEX = 2

@Composable
private fun HomeHeader(extras: HomeExtras) {
    Column(Modifier.fillMaxWidth().background(Brand.Charcoal)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge,
                    color = Brand.Cream,
                )
                Text(
                    stringResource(R.string.brand_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = Brand.Gold,
                )
            }
            val account = extras.account
            val accountLabel =
                if (account ==
                    null
                ) {
                    stringResource(R.string.sign_in)
                } else {
                    stringResource(R.string.account_named, account.firstName)
                }
            Text(
                text = account?.firstName?.take(1)?.uppercase() ?: stringResource(R.string.sign_in),
                style = MaterialTheme.typography.labelLarge,
                color = if (account == null) Brand.Cream else Brand.Charcoal,
                textAlign = TextAlign.Center,
                modifier =
                    Modifier
                        .clip(PillShape)
                        .background(if (account == null) Brand.Charcoal else Brand.Gold)
                        .border(1.dp, Brand.Gold, PillShape)
                        .clickable(role = Role.Button, onClick = extras.onAccount)
                        .semantics { contentDescription = accountLabel }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
            )
            Spacer(Modifier.width(8.dp))
            val cartLabel = stringResource(R.string.your_order_count, extras.cartCount)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier =
                    Modifier
                        .clip(PillShape)
                        .background(Brand.Crimson)
                        .clickable(role = Role.Button, onClick = extras.onOpenCart)
                        .semantics { contentDescription = cartLabel }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(
                    stringResource(R.string.your_order),
                    style = MaterialTheme.typography.labelLarge,
                    color = Brand.White,
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    extras.cartCount.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = Brand.Crimson,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.size(20.dp).clip(CircleShape).background(Brand.White),
                )
            }
        }
        ZigzagTrim()
    }
}

@Composable
private fun Hero(
    site: SiteInfoDto?,
    onOrderNow: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(Brand.Charcoal).padding(20.dp)) {
        Text(
            stringResource(R.string.hero_eyebrow).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Brand.Gold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.hero_title_lead),
            style = MaterialTheme.typography.displaySmall,
            color = Brand.Cream,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(R.string.hero_title_emphasis),
            style = MaterialTheme.typography.displaySmall.copy(fontStyle = FontStyle.Italic),
            color = Brand.Gold,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.hero_body),
            style = MaterialTheme.typography.bodyMedium,
            color = Brand.TextOnDarkMuted,
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = onOrderNow,
            colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson, contentColor = Brand.White),
        ) { Text(stringResource(R.string.hero_cta)) }
        Spacer(Modifier.height(12.dp))
        site?.let {
            Text(
                stringResource(R.string.hero_hours, formatClock(it.hours.opensAt), formatClock(it.hours.closesAt)),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextOnDarkMuted,
            )
            Text(
                stringResource(R.string.hero_delivery, formatNaira(it.delivery.feeKobo), it.delivery.area),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextOnDarkMuted,
            )
        }
        Text(
            stringResource(R.string.hero_pickup),
            style = MaterialTheme.typography.bodySmall,
            color = Brand.TextOnDarkMuted,
        )
        Spacer(Modifier.height(16.dp))
        PhotoPlaceholder(
            Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(topStart = 120.dp, topEnd = 120.dp)),
        )
    }
}

@Composable
private fun Steps() {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            stringResource(R.string.steps_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Brand.Charcoal,
            modifier = Modifier.semantics { heading() },
        )
        listOf(
            R.string.step1_title to R.string.step1_body,
            R.string.step2_title to R.string.step2_body,
            R.string.step3_title to R.string.step3_body,
        ).forEachIndexed { index, (title, body) ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(
                        CardShape,
                    ).background(Brand.White)
                    .border(1.dp, Brand.Border, CardShape)
                    .padding(14.dp),
            ) {
                Text(
                    "${index + 1}",
                    style = MaterialTheme.typography.titleLarge,
                    color = Brand.Gold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.size(32.dp).clip(CircleShape).background(Brand.Charcoal),
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(stringResource(title), style = MaterialTheme.typography.labelLarge, color = Brand.Charcoal)
                    Text(stringResource(body), style = MaterialTheme.typography.bodySmall, color = Brand.TextMuted)
                }
            }
        }
    }
}

private fun LazyListScope.menuSection(
    state: MenuUiState,
    onRetry: () -> Unit,
    onSelectCategory: (String) -> Unit,
    onAdd: (MenuItem) -> Unit,
) {
    item(key = "menu-header") {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.menu_eyebrow).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = Brand.Crimson,
            )
            Text(
                stringResource(R.string.menu_title),
                style = MaterialTheme.typography.displaySmall,
                color = Brand.Charcoal,
                modifier = Modifier.semantics { heading() },
            )
        }
    }
    when (val content = state.content) {
        MenuContent.Loading -> {
            item(key = "menu-loading") {
                Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Brand.Crimson)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        stringResource(R.string.menu_loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Brand.TextMuted,
                    )
                }
            }
        }

        is MenuContent.Failed -> {
            item(key = "menu-error") {
                ErrorState(
                    title = stringResource(R.string.menu_unavailable_title),
                    error = content.error,
                    onRetry = onRetry,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }

        is MenuContent.Ready -> {
            item(key = "menu-tabs") {
                CategoryTabs(content.menu.categories, state.selectedCategoryId, onSelectCategory)
            }
            if (state.visibleItems.isEmpty()) {
                item(key = "menu-empty") {
                    Text(
                        stringResource(R.string.menu_empty_category),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Brand.TextMuted,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
                    )
                }
            }
            items(state.visibleItems, key = { it.id }) { MenuItemCard(it, onAdd, Modifier.padding(horizontal = 16.dp)) }
        }
    }
}

@Composable
private fun CategoryTabs(
    categories: List<MenuCategory>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        items(categories, key = { it.id }) { category ->
            val selected = category.id == selectedId
            Text(
                text = category.label,
                style = MaterialTheme.typography.labelLarge,
                color = if (selected) Brand.Cream else Brand.Charcoal,
                modifier =
                    Modifier
                        .clip(PillShape)
                        .background(if (selected) Brand.Charcoal else Brand.White)
                        .border(1.dp, if (selected) Brand.Charcoal else Brand.Border, PillShape)
                        .clickable(role = Role.Tab) { onSelect(category.id) }
                        .semantics { this.selected = selected }
                        .padding(horizontal = 16.dp, vertical = 9.dp),
            )
        }
    }
}

@Composable
private fun MenuItemCard(
    item: MenuItem,
    onAdd: (MenuItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(Brand.White)
            .border(1.dp, Brand.Border, CardShape),
    ) {
        Box(Modifier.fillMaxWidth().height(170.dp)) {
            ItemPhoto(item, Modifier.fillMaxSize())
            if (item.isHouseSignature) {
                Text(
                    stringResource(R.string.house_signature),
                    style = MaterialTheme.typography.labelSmall,
                    color = Brand.Gold,
                    modifier =
                        Modifier
                            .padding(12.dp)
                            .background(Brand.Charcoal, PillShape)
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
        Column(Modifier.padding(16.dp)) {
            Text(item.name, style = MaterialTheme.typography.titleLarge, color = Brand.Charcoal)
            if (item.description.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(item.description, style = MaterialTheme.typography.bodySmall, color = Brand.TextMuted)
            }
            if (item.optionGroups.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    stringResource(R.string.has_choices, item.optionGroups.joinToString { it.name }),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextMuted,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    priceLabel(item.priceKobo),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = Brand.Charcoal,
                    modifier = Modifier.weight(1f),
                )
                AddButton(item, onAdd)
            }
        }
    }
}

@Composable
private fun ItemPhoto(
    item: MenuItem,
    modifier: Modifier,
) {
    if (item.thumbnailUrl == null) {
        PhotoPlaceholder(modifier)
    } else {
        SubcomposeAsyncImage(
            model = item.thumbnailUrl,
            contentDescription = item.name,
            contentScale = ContentScale.Crop,
            modifier = modifier,
            // A photo that fails to load falls back to the placeholder (AGENT.md 7).
            error = { PhotoPlaceholder(modifier) },
            loading = { PhotoPlaceholder(modifier) },
        )
    }
}

@Composable
private fun AddButton(
    item: MenuItem,
    onAdd: (MenuItem) -> Unit,
) {
    if (!item.isAvailable) {
        Text(
            stringResource(R.string.sold_out),
            style = MaterialTheme.typography.labelMedium,
            color = Brand.TextMuted,
            modifier =
                Modifier
                    .background(Brand.Cream, PillShape)
                    .border(1.dp, Brand.Border, PillShape)
                    .padding(horizontal = 12.dp, vertical = 5.dp),
        )
        return
    }
    val label =
        if (item.optionGroups.isEmpty()) {
            stringResource(R.string.add_named, item.name)
        } else {
            stringResource(R.string.choose_named, item.name)
        }
    Text(
        stringResource(R.string.add),
        style = MaterialTheme.typography.labelLarge,
        color = Brand.White,
        modifier =
            Modifier
                .clip(PillShape)
                .background(Brand.Crimson)
                .clickable(role = Role.Button) { onAdd(item) }
                .semantics { contentDescription = label }
                .padding(horizontal = 16.dp, vertical = 7.dp),
    )
}

@Composable
private fun Juices(
    juices: List<MenuItem>,
    onAdd: (MenuItem) -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(Brand.Crimson)) {
        ZigzagTrim()
        Column(Modifier.padding(20.dp)) {
            Text(
                stringResource(R.string.juices_eyebrow).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = Brand.Gold,
            )
            Text(
                stringResource(R.string.juices_title),
                style = MaterialTheme.typography.headlineSmall,
                color = Brand.Cream,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.juices_body), style = MaterialTheme.typography.bodySmall, color = Brand.Cream)
        }
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 20.dp),
        ) {
            items(juices, key = { "juice-${it.id}" }) { juice ->
                Column(
                    Modifier
                        .width(150.dp)
                        .clip(CardShape)
                        .background(Brand.White)
                        .padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    ItemPhoto(
                        juice,
                        Modifier
                            .fillMaxWidth()
                            .height(
                                110.dp,
                            ).clip(RoundedCornerShape(topStart = 60.dp, topEnd = 60.dp)),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(juice.name, style = MaterialTheme.typography.labelLarge, color = Brand.Charcoal)
                    Text(
                        priceLabel(juice.priceKobo),
                        style = MaterialTheme.typography.bodySmall,
                        color = Brand.TextMuted,
                    )
                    Spacer(Modifier.height(6.dp))
                    AddButton(juice, onAdd)
                }
            }
        }
    }
}

@Composable
private fun Story() {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Text(
            stringResource(R.string.story_eyebrow).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Brand.Crimson,
        )
        Text(
            stringResource(R.string.story_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Brand.Charcoal,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.story_body), style = MaterialTheme.typography.bodyMedium, color = Brand.TextMuted)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.story_founder),
            style = MaterialTheme.typography.bodySmall,
            color = Brand.TextMuted,
        )
        Spacer(Modifier.height(12.dp))
        PhotoPlaceholder(Modifier.fillMaxWidth().height(160.dp).clip(CardShape))
    }
}

@Composable
private fun Visit(site: SiteInfoDto?) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            stringResource(R.string.visit_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Brand.Charcoal,
            modifier = Modifier.semantics { heading() },
        )
        site?.branches?.forEach { branch -> BranchCard(branch) }
        if (site != null) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(CardShape)
                    .background(Brand.Charcoal)
                    .padding(16.dp),
            ) {
                Text(
                    stringResource(R.string.visit_hours).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Brand.Gold,
                )
                Text(
                    stringResource(
                        R.string.visit_hours_line,
                        formatClock(site.hours.opensAt),
                        formatClock(site.hours.closesAt),
                    ),
                    style = MaterialTheme.typography.titleLarge,
                    color = Brand.Cream,
                )
                Text(
                    stringResource(R.string.visit_orders_close, formatClock(site.hours.onlineOrdersCloseAt)),
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.TextOnDarkMuted,
                )
            }
        }
        Text(stringResource(R.string.visit_events), style = MaterialTheme.typography.bodySmall, color = Brand.TextMuted)
    }
}

@Composable
private fun BranchCard(branch: BranchDto) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(
                CardShape,
            ).background(Brand.White)
            .border(1.dp, Brand.Border, CardShape)
            .padding(16.dp),
    ) {
        Text(
            stringResource(
                if (branch.role ==
                    BranchDto.Role.HEADQUARTERS
                ) {
                    R.string.visit_headquarters
                } else {
                    R.string.visit_branch
                },
            ).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Brand.Crimson,
        )
        Text(branch.city, style = MaterialTheme.typography.titleLarge, color = Brand.Charcoal)
        Text(
            branch.streetAddress ?: stringResource(R.string.visit_address_placeholder, branch.city.uppercase()),
            style = MaterialTheme.typography.bodySmall,
            color = Brand.TextMuted,
        )
        Text("${branch.city}, ${branch.state}", style = MaterialTheme.typography.bodySmall, color = Brand.TextMuted)
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(if (branch.onlineOrderingEnabled) R.string.visit_online else R.string.visit_coming_soon),
            style = MaterialTheme.typography.labelMedium,
            color = if (branch.onlineOrderingEnabled) Brand.Charcoal else Brand.TextMuted,
        )
    }
}

@Composable
private fun Footer(site: SiteInfoDto?) {
    Column(Modifier.fillMaxWidth().background(Brand.Charcoal)) {
        ZigzagTrim()
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleLarge, color = Brand.Cream)
            Text(
                stringResource(R.string.footer_tagline),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextOnDarkMuted,
            )
            Text(
                site?.phoneWhatsapp ?: stringResource(R.string.phone_placeholder),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.Gold,
            )
            Text(
                stringResource(R.string.footer_domain),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextOnDarkMuted,
            )
        }
    }
}
