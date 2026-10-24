<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminOption, AdminOptionGroup } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { formatNaira } from '@/utils/format';
import { koboToInput, parseNairaInput } from '@/utils/naira-input';
import ActionError from './ActionError.vue';
import OnOffSwitch from './OnOffSwitch.vue';

/**
 * One meat (or other option): its normal price, its price on particular dishes, and its on/off
 * switch. Each change saves on its own; supervisors and super admins may make all of them.
 */
const props = defineProps<{
  group: AdminOptionGroup;
  option: AdminOption;
  dishNames: Record<string, string>;
}>();
const emit = defineEmits<{
  /** The API returned the whole group after a change. */
  group: [group: AdminOptionGroup];
  /** A dish's special price changed (null: back to the normal price). */
  override: [itemId: string, priceDeltaKobo: number | null];
}>();

const toast = useToastStore();
const price = ref(koboToInput(props.option.priceDeltaKobo));
const priceError = ref<ApiError | string | null>(null);
const savingPrice = ref(false);
const switching = ref(false);
const switchError = ref<ApiError | null>(null);
const perDishOpen = ref(false);

watch(
  () => props.option.priceDeltaKobo,
  (kobo) => (price.value = koboToInput(kobo)),
);

/** Dishes offering this meat, each with its special price if it has one. */
const dishes = computed(() =>
  props.group.itemIds
    .filter((id) => !props.option.excludedFromItemIds.includes(id))
    .map((id) => ({
      id,
      name: props.dishNames[id] ?? 'Unknown dish',
      override: props.option.priceOverrides.find((o) => o.itemId === id)?.priceDeltaKobo ?? null,
    })),
);
const overrideCount = computed(() => dishes.value.filter((d) => d.override !== null).length);

const dishInputs = reactive<Record<string, string>>({});
const dishErrors = reactive<Record<string, ApiError | string>>({});
const dishSaving = reactive<Record<string, boolean>>({});
watch(
  dishes,
  (list, previous) => {
    // Refresh only boxes whose saved price changed, so unsaved typing elsewhere survives.
    for (const dish of list) {
      const before = previous?.find((d) => d.id === dish.id);
      if (before && before.override === dish.override) continue;
      dishInputs[dish.id] = dish.override === null ? '' : koboToInput(dish.override);
    }
  },
  { immediate: true },
);

async function savePrice(): Promise<void> {
  const parsed = parseNairaInput(price.value);
  if ('error' in parsed) {
    priceError.value = parsed.error;
    return;
  }
  priceError.value = null;
  savingPrice.value = true;
  try {
    const group = await api.patch<AdminOptionGroup>(`/admin/options/${props.option.id}`, {
      priceDeltaKobo: parsed.kobo,
    });
    emit('group', group);
    toast.show(`${props.option.name} now adds ${formatNaira(parsed.kobo)}.`);
  } catch (err) {
    priceError.value = asApiError(err);
  } finally {
    savingPrice.value = false;
  }
}

async function toggle(): Promise<void> {
  const next = !props.option.isAvailable;
  switchError.value = null;
  switching.value = true;
  try {
    const group = await api.patch<AdminOptionGroup>(`/admin/options/${props.option.id}`, {
      isAvailable: next,
    });
    emit('group', group);
    toast.show(
      next
        ? `${props.option.name} is available again.`
        : `${props.option.name} is now switched off.`,
    );
  } catch (err) {
    switchError.value = asApiError(err);
  } finally {
    switching.value = false;
  }
}

async function saveDish(itemId: string, dishName: string, clear = false): Promise<void> {
  let kobo: number | null = null;
  if (!clear) {
    const parsed = parseNairaInput(dishInputs[itemId] ?? '');
    if ('error' in parsed) {
      dishErrors[itemId] = parsed.error;
      return;
    }
    kobo = parsed.kobo;
  }
  delete dishErrors[itemId];
  dishSaving[itemId] = true;
  try {
    await api.put(`/admin/menu-items/${itemId}/options/${props.option.id}`, {
      priceDeltaKobo: kobo,
    });
    emit('override', itemId, kobo);
    toast.show(
      kobo === null
        ? `${dishName} uses the normal ${props.option.name} price again.`
        : `${props.option.name} now adds ${formatNaira(kobo)} on ${dishName}.`,
    );
  } catch (err) {
    dishErrors[itemId] = asApiError(err);
  } finally {
    dishSaving[itemId] = false;
  }
}

const dishLabel = (n: number) => `${n} ${n === 1 ? 'dish' : 'dishes'}`;
</script>

<template>
  <article class="meat" data-test="meat">
    <header class="top">
      <h3>{{ option.name }}</h3>
      <span class="state-label" :class="{ off: !option.isAvailable }">
        {{ option.isAvailable ? 'On' : 'Off' }}
      </span>
      <OnOffSwitch
        :checked="option.isAvailable"
        :label="`${option.name} available`"
        :disabled="switching"
        @toggle="toggle"
      />
    </header>
    <ActionError v-if="switchError" :error="switchError" />

    <form class="price" data-test="price-form" novalidate @submit.prevent="savePrice">
      <label :for="`price-${option.id}`">Normal extra cost (₦)</label>
      <div class="field">
        <input
          :id="`price-${option.id}`"
          v-model="price"
          data-test="price"
          inputmode="decimal"
          autocomplete="off"
          :aria-invalid="priceError ? 'true' : undefined"
          :aria-describedby="priceError ? `price-error-${option.id}` : undefined"
        />
        <button type="submit" class="btn-primary btn-sm" :disabled="savingPrice">Save</button>
      </div>
      <div v-if="priceError" :id="`price-error-${option.id}`" data-test="price-error">
        <ActionError :error="priceError" />
      </div>
    </form>

    <button
      type="button"
      class="per-dish-toggle"
      data-test="per-dish-toggle"
      :aria-expanded="perDishOpen"
      :aria-controls="`dishes-${option.id}`"
      @click="perDishOpen = !perDishOpen"
    >
      {{
        overrideCount
          ? `Different price on ${dishLabel(overrideCount)}`
          : 'Set a different price on a dish'
      }}
    </button>

    <ul v-if="perDishOpen" :id="`dishes-${option.id}`" class="dishes">
      <li v-for="dish in dishes" :key="dish.id" data-test="dish-price">
        <form novalidate @submit.prevent="saveDish(dish.id, dish.name)">
          <label :for="`dish-${option.id}-${dish.id}`"
            ><span class="sr-only">{{ option.name }} extra cost on </span>{{ dish.name }}</label
          >
          <div class="field">
            <input
              :id="`dish-${option.id}-${dish.id}`"
              v-model="dishInputs[dish.id]"
              inputmode="decimal"
              autocomplete="off"
              :placeholder="`${koboToInput(option.priceDeltaKobo)} (normal price)`"
              :aria-invalid="dishErrors[dish.id] ? 'true' : undefined"
            />
            <button type="submit" class="btn-outline-small" :disabled="dishSaving[dish.id]">
              Save
            </button>
            <button
              v-if="dish.override !== null"
              type="button"
              class="link"
              data-test="use-normal"
              :disabled="dishSaving[dish.id]"
              @click="saveDish(dish.id, dish.name, true)"
            >
              Use normal price
            </button>
          </div>
          <ActionError v-if="dishErrors[dish.id]" :error="dishErrors[dish.id]!" />
        </form>
      </li>
      <li v-if="!dishes.length" class="none">No dish offers {{ option.name }} at the moment.</li>
    </ul>
  </article>
</template>

<style scoped>
.meat {
  padding: 1rem 1.25rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
h3 {
  flex: 1;
  margin: 0;
  font-size: 1.375rem;
}
.state-label {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.state-label.off {
  color: var(--color-crimson);
  font-weight: 600;
}
.price {
  margin-top: 0.75rem;
}
label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
}
.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
input {
  width: 8rem;
  min-height: 2.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
}
input[aria-invalid='true'] {
  border-color: var(--color-crimson);
}
input::placeholder {
  color: var(--color-text-muted);
}
.per-dish-toggle,
.link {
  margin-top: 0.75rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-crimson);
  font: 600 0.875rem var(--font-body);
  cursor: pointer;
  text-decoration: underline;
}
.link {
  margin-top: 0;
}
.btn-outline-small {
  min-height: 2.25rem;
  padding: 0.375rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 600 0.8125rem var(--font-body);
  cursor: pointer;
}
.dishes {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-border);
}
.dishes li {
  padding: 0.75rem 0 0;
}
.none {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
