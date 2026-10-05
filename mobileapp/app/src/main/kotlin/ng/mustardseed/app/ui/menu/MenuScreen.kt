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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import ng.mustardseed.app.R
import ng.mustardseed.app.data.MenuCategory
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.ui.components.BrandHeader
import ng.mustardseed.app.ui.components.ErrorState
import ng.mustardseed.app.ui.components.PhotoPlaceholder
import ng.mustardseed.app.ui.components.TestModeBanner
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.priceLabel

private val CardShape = RoundedCornerShape(16.dp)
private val PillShape = RoundedCornerShape(50)

/** Today's menu: category tabs and item cards (docs/landing-page.pdf), read-only for now. */
@Composable
fun MenuScreen(
    state: MenuUiState,
    onRetry: () -> Unit,
    onSelectCategory: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().background(Brand.Cream)) {
        if (state.testMode) TestModeBanner()
        BrandHeader()
        when (val content = state.content) {
            MenuContent.Loading -> {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator(color = Brand.Crimson)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        stringResource(R.string.menu_loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Brand.TextMuted,
                    )
                }
            }

            is MenuContent.Failed -> {
                ErrorState(
                    title = stringResource(R.string.menu_unavailable_title),
                    error = content.error,
                    onRetry = onRetry,
                    modifier = Modifier.padding(16.dp),
                )
            }

            is MenuContent.Ready -> {
                MenuList(
                    categories = content.menu.categories,
                    selectedId = state.selectedCategoryId,
                    items = state.visibleItems,
                    onSelectCategory = onSelectCategory,
                )
            }
        }
    }
}

@Composable
private fun MenuList(
    categories: List<MenuCategory>,
    selectedId: String?,
    items: List<MenuItem>,
    onSelectCategory: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("menu-list"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
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
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(categories, key = { it.id }) { category ->
                    CategoryPill(category.label, category.id == selectedId) { onSelectCategory(category.id) }
                }
            }
        }
        if (items.isEmpty()) {
            item {
                Text(
                    stringResource(R.string.menu_empty_category),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.TextMuted,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }
        items(items, key = { it.id }) { MenuItemCard(it) }
        item {
            Text(
                stringResource(R.string.ordering_coming),
                style = MaterialTheme.typography.bodySmall,
                color = Brand.TextMuted,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun CategoryPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) Brand.Cream else Brand.Charcoal,
        modifier =
            Modifier
                .clip(PillShape)
                .background(if (selected) Brand.Charcoal else Brand.White)
                .border(1.dp, if (selected) Brand.Charcoal else Brand.Border, PillShape)
                .clickable(role = Role.Tab, onClick = onClick)
                .semantics { this.selected = selected }
                .padding(horizontal = 16.dp, vertical = 9.dp),
    )
}

@Composable
private fun MenuItemCard(item: MenuItem) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(Brand.White)
            .border(1.dp, Brand.Border, CardShape),
    ) {
        Box(Modifier.fillMaxWidth().height(170.dp)) {
            val photo = Modifier.fillMaxSize()
            if (item.thumbnailUrl == null) {
                PhotoPlaceholder(photo)
            } else {
                SubcomposeAsyncImage(
                    model = item.thumbnailUrl,
                    contentDescription = item.name,
                    contentScale = ContentScale.Crop,
                    modifier = photo,
                    // A photo that fails to load falls back to the placeholder (AGENT.md 7).
                    error = { PhotoPlaceholder(photo) },
                    loading = { PhotoPlaceholder(photo) },
                )
            }
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
                }
            }
        }
    }
}
