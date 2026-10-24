<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminMenuItem, Menu } from '@/api/types';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useToastStore } from '@/stores/toast';
import { formatNaira, priceLabel } from '@/utils/format';
import { koboToInput, MAX_DISH_KOBO, parseNairaInput } from '@/utils/naira-input';

/**
 * Item prices (AGENT.md section 11, slice 8), super admins only: every dish by category, each
 * saved on its own. A dish without a price shows [PRICE] to customers and cannot be ordered.
 */
interface Row {
  id: string;
  name: string;
  priceKobo: number | null;
  text: string;
}

const toast = useToastStore();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const categories = ref<Array<{ id: string; label: string; rows: Row[] }>>([]);
const saving = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, ApiError | string>>({});
const confirmingRemove = ref<string | null>(null);

const asText = (kobo: number | null) => (kobo === null ? '' : koboToInput(kobo));

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  try {
    const menu = await api.get<Menu>('/menu');
    categories.value = menu.categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        id: c.id,
        label: c.label,
        rows: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          priceKobo: i.priceKobo,
          text: asText(i.priceKobo),
        })),
      }));
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

async function save(row: Row, priceKobo: number | null): Promise<void> {
  delete errors[row.id];
  saving[row.id] = true;
  try {
    const item = await api.patch<AdminMenuItem>(`/admin/menu-items/${row.id}`, { priceKobo });
    row.priceKobo = item.priceKobo;
    row.text = asText(item.priceKobo);
    confirmingRemove.value = null;
    toast.show(
      item.priceKobo === null
        ? `${row.name} has no price now.`
        : `${row.name} now costs ${formatNaira(item.priceKobo)}.`,
    );
  } catch (err) {
    errors[row.id] = asApiError(err);
  } finally {
    saving[row.id] = false;
  }
}

function submit(row: Row): void {
  const parsed = parseNairaInput(row.text, { maxKobo: MAX_DISH_KOBO, allowZero: false });
  if ('error' in parsed) {
    errors[row.id] = parsed.error;
    return;
  }
  void save(row, parsed.kobo);
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Item prices</h1>
    <p class="lead">
      Prices are in naira. A dish without a price shows [PRICE] to customers and can’t be ordered.
    </p>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the menu…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the menu."
      :error="loadError"
      @retry="load"
    />

    <p v-else-if="!categories.length" class="state">No dishes on the menu yet.</p>

    <section
      v-for="category in categories"
      v-else
      :key="category.id"
      class="category"
      :aria-labelledby="`cat-${category.id}`"
    >
      <h2 :id="`cat-${category.id}`">{{ category.label }}</h2>
      <ul class="rows">
        <li v-for="row in category.rows" :key="row.id" data-test="dish">
          <form class="line" novalidate @submit.prevent="submit(row)">
            <div class="who">
              <span class="name">{{ row.name }}</span>
              <span class="current" :class="{ missing: row.priceKobo === null }">
                {{ priceLabel(row.priceKobo) }}
                <template v-if="row.priceKobo === null"> · Not orderable until priced</template>
              </span>
            </div>
            <div class="field">
              <span class="currency" aria-hidden="true">₦</span>
              <input
                v-model="row.text"
                inputmode="decimal"
                autocomplete="off"
                :aria-label="`Price of ${row.name} in naira`"
                :aria-invalid="errors[row.id] ? 'true' : undefined"
              />
              <button type="submit" class="btn-primary btn-sm" :disabled="saving[row.id]">
                Save
              </button>
              <button
                v-if="row.priceKobo !== null"
                type="button"
                class="link"
                data-test="remove-price"
                :disabled="saving[row.id]"
                @click="confirmingRemove = row.id"
              >
                Remove price
              </button>
            </div>
          </form>
          <div v-if="confirmingRemove === row.id" class="confirm" data-test="remove-confirm">
            <p>
              <strong>Remove the price of {{ row.name }}?</strong> Customers can’t order
              {{ row.name }} until it has a price again.
            </p>
            <div class="field">
              <button
                type="button"
                class="btn-primary btn-sm"
                data-test="remove-yes"
                :disabled="saving[row.id]"
                @click="save(row, null)"
              >
                Remove price
              </button>
              <button
                type="button"
                class="link"
                data-test="remove-no"
                @click="confirmingRemove = null"
              >
                Keep it
              </button>
            </div>
          </div>
          <ActionError v-if="errors[row.id]" :error="errors[row.id]!" />
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2rem;
}
.lead,
.state {
  margin: 0 0 1.5rem;
  color: var(--color-text-muted);
}
.category {
  margin-bottom: 1.5rem;
}
.category h2 {
  margin: 0 0 0.5rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.rows li {
  padding: 0.75rem 1rem;
}
.rows li + li {
  border-top: 1px solid var(--color-border);
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.who {
  display: grid;
  min-width: 10rem;
}
.name {
  font-weight: 600;
}
.current {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.current.missing {
  color: var(--color-crimson);
  font-weight: 600;
}
.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.currency {
  font-weight: 600;
}
input {
  width: 7.5rem;
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
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-crimson);
  font: 600 0.875rem var(--font-body);
  text-decoration: underline;
  cursor: pointer;
}
.confirm {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: var(--color-surface-soft);
}
.confirm p {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
}
</style>
