<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminOptionGroup, Menu } from '@/api/types';
import InlineError from '@/components/ui/InlineError.vue';
import { useToastStore } from '@/stores/toast';

/**
 * Switch dishes and meats on or off (AGENT.md section 11, slice 8). Each switch saves on its
 * own; a failed save keeps the old state and explains why on that row.
 */
interface Row {
  key: string;
  name: string;
  isAvailable: boolean;
  path: string;
}

const toast = useToastStore();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const meatGroups = ref<Array<{ id: string; name: string; rows: Row[] }>>([]);
const dishCategories = ref<Array<{ id: string; label: string; rows: Row[] }>>([]);
const saving = reactive(new Set<string>());
const rowErrors = reactive(new Map<string, ApiError>());

const hasMeats = computed(() => meatGroups.value.length > 0);
const hasDishes = computed(() => dishCategories.value.length > 0);

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  try {
    const [menu, groups] = await Promise.all([
      api.get<Menu>('/menu'),
      api.get<AdminOptionGroup[]>('/admin/option-groups'),
    ]);
    meatGroups.value = groups
      .filter((g) => !g.archived)
      .map((g) => ({
        id: g.id,
        name: g.name,
        rows: g.options
          .filter((o) => !o.archived)
          .map((o) => ({
            key: `option:${o.id}`,
            name: o.name,
            isAvailable: o.isAvailable,
            path: `/admin/options/${o.id}`,
          })),
      }))
      .filter((g) => g.rows.length > 0);
    dishCategories.value = menu.categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        id: c.id,
        label: c.label,
        rows: c.items.map((i) => ({
          key: `item:${i.id}`,
          name: i.name,
          isAvailable: i.isAvailable,
          path: `/admin/menu-items/${i.id}`,
        })),
      }));
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

async function toggle(row: Row, soldOutWord: string): Promise<void> {
  const next = !row.isAvailable;
  saving.add(row.key);
  rowErrors.delete(row.key);
  try {
    await api.patch(row.path, { isAvailable: next });
    row.isAvailable = next;
    toast.show(next ? `${row.name} is available again.` : `${row.name} is now ${soldOutWord}.`);
  } catch (err) {
    rowErrors.set(row.key, asApiError(err));
  } finally {
    saving.delete(row.key);
  }
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Availability</h1>
    <p class="lead">
      Switch something off when the kitchen runs out. Customers still see it, marked as not
      available, but can’t order it.
    </p>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the menu…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the menu."
      :error="loadError"
      @retry="load"
    />

    <template v-else>
      <section class="block" data-test="meats" aria-labelledby="meats-title">
        <h2 id="meats-title">Meats and other choices</h2>
        <p class="hint">Switching one off removes it from every dish that offers it.</p>
        <p v-if="!hasMeats" class="empty">No meats or other choices yet.</p>
        <div v-for="group in meatGroups" :key="group.id" class="group">
          <h3>{{ group.name }}</h3>
          <ul class="rows">
            <li v-for="row in group.rows" :key="row.key" data-test="availability-row">
              <div class="line">
                <span class="name">{{ row.name }}</span>
                <span class="state-label" :class="{ off: !row.isAvailable }">
                  {{ row.isAvailable ? 'On' : 'Off' }}
                </span>
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  :aria-checked="row.isAvailable"
                  :aria-label="`${row.name} available`"
                  :disabled="saving.has(row.key)"
                  @click="toggle(row, 'switched off')"
                >
                  <span class="knob" aria-hidden="true" />
                </button>
              </div>
              <p v-if="rowErrors.get(row.key)" class="row-error" role="alert">
                {{ rowErrors.get(row.key)?.message }}
                <span v-if="rowErrors.get(row.key)?.requestId" class="reference">
                  Reference: {{ rowErrors.get(row.key)?.requestId }}
                </span>
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section class="block" data-test="dishes" aria-labelledby="dishes-title">
        <h2 id="dishes-title">Dishes and drinks</h2>
        <p v-if="!hasDishes" class="empty">No dishes on the menu yet.</p>
        <div v-for="category in dishCategories" :key="category.id" class="group">
          <h3>{{ category.label }}</h3>
          <ul class="rows">
            <li v-for="row in category.rows" :key="row.key" data-test="availability-row">
              <div class="line">
                <span class="name">{{ row.name }}</span>
                <span class="state-label" :class="{ off: !row.isAvailable }">
                  {{ row.isAvailable ? 'Available' : 'Sold out' }}
                </span>
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  :aria-checked="row.isAvailable"
                  :aria-label="`${row.name} available`"
                  :disabled="saving.has(row.key)"
                  @click="toggle(row, 'sold out')"
                >
                  <span class="knob" aria-hidden="true" />
                </button>
              </div>
              <p v-if="rowErrors.get(row.key)" class="row-error" role="alert">
                {{ rowErrors.get(row.key)?.message }}
                <span v-if="rowErrors.get(row.key)?.requestId" class="reference">
                  Reference: {{ rowErrors.get(row.key)?.requestId }}
                </span>
              </p>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2rem;
}
.lead,
.hint {
  margin: 0 0 1.25rem;
  color: var(--color-text-muted);
}
.hint {
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}
.state,
.empty {
  color: var(--color-text-muted);
}
.block {
  margin-bottom: 2rem;
}
.block h2 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
}
.group {
  margin-bottom: 1.25rem;
}
.group h3 {
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
  align-items: center;
  gap: 0.75rem;
}
.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}
.state-label {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.state-label.off {
  color: var(--color-crimson);
  font-weight: 600;
}
.switch {
  position: relative;
  flex: none;
  width: 3rem;
  height: 1.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--color-border);
  cursor: pointer;
}
.switch[aria-checked='true'] {
  background: var(--color-charcoal);
}
.switch:disabled {
  opacity: 0.5;
  cursor: progress;
}
.knob {
  position: absolute;
  top: 0.1875rem;
  left: 0.1875rem;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 50%;
  background: var(--color-white);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-charcoal) 30%, transparent);
  transition: transform 0.15s ease;
}
.switch[aria-checked='true'] .knob {
  transform: translateX(1.25rem);
}
.row-error {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: var(--color-crimson);
}
.reference {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
@media (prefers-reduced-motion: reduce) {
  .knob {
    transition: none;
  }
}
</style>
