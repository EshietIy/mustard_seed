package ng.mustardseed.app.ui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ng.mustardseed.app.R
import ng.mustardseed.app.data.MenuItem
import ng.mustardseed.app.data.OptionGroup
import ng.mustardseed.app.ui.theme.Brand
import ng.mustardseed.app.util.formatNaira

private val Shape = RoundedCornerShape(16.dp)

/**
 * Choices for one item (AGENT.md section 14). Renders whatever groups the API returns, so new
 * options appear without an app release. Nothing is preselected; Add waits for required choices.
 */
@Composable
fun ChoiceSheet(
    item: MenuItem,
    onAdd: (optionIds: List<String>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var chosen by remember(item.id) { mutableStateOf(item.optionGroups.associate { it.id to emptyList<String>() }) }
    val picked = { group: OptionGroup -> chosen[group.id].orEmpty() }
    val missing = item.optionGroups.firstOrNull { picked(it).size < it.minChoices }
    val selectedIds = item.optionGroups.flatMap { g -> g.options.filter { it.id in picked(g) }.map { it.id } }
    val price =
        item.priceKobo?.let { base ->
            base +
                item.optionGroups
                    .flatMap { it.options }
                    .filter { it.id in selectedIds }
                    .sumOf { it.priceDeltaKobo }
        }

    Column(modifier.fillMaxWidth().padding(horizontal = 20.dp).testTag("choice-sheet")) {
        Text(
            item.name,
            style = MaterialTheme.typography.headlineSmall,
            color = Brand.Charcoal,
            modifier = Modifier.semantics { heading() },
        )
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            item.optionGroups.forEach { group ->
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        group.name,
                        style = MaterialTheme.typography.labelLarge,
                        color = Brand.Charcoal,
                        modifier = Modifier.weight(1f),
                    )
                    Text(rule(group), style = MaterialTheme.typography.labelSmall, color = Brand.TextMuted)
                }
                Spacer(Modifier.height(6.dp))
                group.options.forEach { option ->
                    val single = group.maxChoices == 1
                    val isPicked = option.id in picked(group)
                    val full = !single && picked(group).size >= group.maxChoices && !isPicked
                    val enabled = option.isAvailable && !full
                    val toggle = { on: Boolean ->
                        chosen =
                            chosen + (
                                group.id to
                                    when {
                                        single -> if (on) listOf(option.id) else emptyList()
                                        on -> picked(group) + option.id
                                        else -> picked(group) - option.id
                                    }
                            )
                    }
                    val rowModifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .background(Brand.White, Shape)
                            .border(1.dp, Brand.Border, Shape)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier =
                            if (single) {
                                rowModifier.selectable(
                                    isPicked,
                                    enabled = enabled,
                                    role = Role.RadioButton,
                                ) { toggle(true) }
                            } else {
                                rowModifier.toggleable(isPicked, enabled = enabled, role = Role.Checkbox) { toggle(it) }
                            }.padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        if (single) {
                            RadioButton(
                                isPicked,
                                onClick = null,
                                enabled = enabled,
                                colors = RadioButtonDefaults.colors(selectedColor = Brand.Crimson),
                            )
                        } else {
                            Checkbox(
                                isPicked,
                                onCheckedChange = null,
                                enabled = enabled,
                                colors = CheckboxDefaults.colors(checkedColor = Brand.Crimson),
                            )
                        }
                        Text(
                            option.name,
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (enabled || isPicked) Brand.Charcoal else Brand.TextMuted,
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                        )
                        when {
                            !option.isAvailable -> {
                                Text(
                                    stringResource(R.string.not_available),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Brand.TextMuted,
                                )
                            }

                            option.priceDeltaKobo > 0 -> {
                                Text(
                                    "+${formatNaira(option.priceDeltaKobo)}",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = Brand.Charcoal,
                                )
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        missing?.let { group ->
            val what = group.name.lowercase()
            Text(
                when {
                    group.minChoices > 1 -> stringResource(R.string.choose_at_least, group.minChoices, what)
                    what.first() in "aeiou" -> stringResource(R.string.choose_an, what)
                    else -> stringResource(R.string.choose_a, what)
                },
                style = MaterialTheme.typography.bodySmall,
                color = Brand.Charcoal,
                modifier = Modifier.fillMaxWidth().background(Brand.CrimsonSoft).padding(10.dp),
            )
            Spacer(Modifier.height(8.dp))
        }
        Button(
            onClick = { onAdd(selectedIds) },
            enabled = missing == null,
            colors = ButtonDefaults.buttonColors(containerColor = Brand.Crimson, contentColor = Brand.White),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                price?.let { stringResource(R.string.add_to_order_price, formatNaira(it)) }
                    ?: stringResource(R.string.add_to_order),
            )
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun rule(group: OptionGroup): String =
    when {
        group.maxChoices == 1 && group.minChoices > 0 -> stringResource(R.string.rule_required_one)
        group.minChoices > 0 -> stringResource(R.string.rule_required_range, group.minChoices, group.maxChoices)
        else -> stringResource(R.string.rule_optional_up_to, group.maxChoices)
    }
