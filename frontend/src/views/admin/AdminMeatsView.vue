<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminOption, AdminOptionGroup, Menu } from '@/api/types';
import AddOptionForm from '@/components/admin/AddOptionForm.vue';
import MeatCard from '@/components/admin/MeatCard.vue';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

/**
 * Meats & prices (AGENT.md section 11, slice 8): every live choice group and its options.
 * Super admins also rename, reorder, archive and restore options, and choose their dishes.
 */
const auth = useAuthStore();
const toast = useToastStore();
const canManage = computed(() => auth.user?.role === 'super_admin');
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const groups = ref<AdminOptionGroup[]>([]);
const dishNames = ref<Record<string, string>>({});

const bySort = (a: AdminOption, b: AdminOption) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

const liveGroups = computed(() =>
  groups.value
    .filter((g) => !g.archived)
    .map((g) => ({
      group: g,
      options: g.options.filter((o) => !o.archived).sort(bySort),
      archived: g.options.filter((o) => o.archived).sort(bySort),
    })),
);

const moving = ref<string | null>(null);
const orderErrors = reactive<Record<string, ApiError>>({});
const restoring = reactive<Record<string, boolean>>({});
const restoreErrors = reactive<Record<string, ApiError>>({});

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  try {
    const [list, menu] = await Promise.all([
      api.get<AdminOptionGroup[]>('/admin/option-groups'),
      api.get<Menu>('/menu'),
    ]);
    groups.value = list;
    dishNames.value = Object.fromEntries(
      menu.categories.flatMap((c) => c.items).map((i) => [i.id, i.name]),
    );
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

function replaceGroup(updated: AdminOptionGroup): void {
  groups.value = groups.value.map((g) => (g.id === updated.id ? updated : g));
}

function applyExclusion(optionId: string, itemId: string, excluded: boolean): void {
  for (const group of groups.value) {
    const option = group.options.find((o) => o.id === optionId);
    if (!option) continue;
    option.excludedFromItemIds = option.excludedFromItemIds.filter((id) => id !== itemId);
    if (excluded) option.excludedFromItemIds.push(itemId);
    // Either way the dish's special price is gone (see the API's override rules).
    option.priceOverrides = option.priceOverrides.filter((o) => o.itemId !== itemId);
  }
}

/** Swaps an option with its neighbour, then saves 10, 20, 30… for every option that moved. */
async function move(groupId: string, options: AdminOption[], index: number, step: -1 | 1) {
  const order = [...options];
  const target = index + step;
  const [moved] = order.splice(index, 1);
  if (!moved || target < 0 || target > order.length) return;
  order.splice(target, 0, moved);
  delete orderErrors[groupId];
  moving.value = groupId;
  try {
    let latest: AdminOptionGroup | null = null;
    for (const [i, option] of order.entries()) {
      const sortOrder = (i + 1) * 10;
      if (option.sortOrder === sortOrder) continue;
      latest = await api.patch<AdminOptionGroup>(`/admin/options/${option.id}`, { sortOrder });
    }
    if (latest) replaceGroup(latest);
  } catch (err) {
    orderErrors[groupId] = asApiError(err);
    // Some moves may have saved: show the order the server now has.
    void reloadGroups();
  } finally {
    moving.value = null;
  }
}

async function reloadGroups(): Promise<void> {
  try {
    groups.value = await api.get<AdminOptionGroup[]>('/admin/option-groups');
  } catch {
    // The error above already explains the failure; keep what is on screen.
  }
}

async function restore(option: AdminOption): Promise<void> {
  delete restoreErrors[option.id];
  restoring[option.id] = true;
  try {
    replaceGroup(
      await api.patch<AdminOptionGroup>(`/admin/options/${option.id}`, { archived: false }),
    );
    toast.show(`${option.name} is back on the menu.`);
  } catch (err) {
    restoreErrors[option.id] = asApiError(err);
  } finally {
    restoring[option.id] = false;
  }
}

function applyOverride(optionId: string, itemId: string, priceDeltaKobo: number | null): void {
  for (const group of groups.value) {
    const option = group.options.find((o) => o.id === optionId);
    if (!option) continue;
    option.priceOverrides = option.priceOverrides.filter((o) => o.itemId !== itemId);
    if (priceDeltaKobo !== null) option.priceOverrides.push({ itemId, priceDeltaKobo });
  }
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Meats &amp; prices</h1>
    <p class="lead">
      The extra cost is added to the dish’s own price. Set a different extra cost on a dish where it
      should cost more or less.
    </p>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the meats…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the meats."
      :error="loadError"
      @retry="load"
    />

    <p v-else-if="!liveGroups.length" class="state">
      No meats or other choices have been set up yet.
    </p>

    <section
      v-for="{ group, options, archived } in liveGroups"
      v-else
      :key="group.id"
      class="group"
      :aria-labelledby="`group-${group.id}`"
    >
      <h2 :id="`group-${group.id}`">{{ group.name }}</h2>
      <div v-if="orderErrors[group.id]" data-test="order-error">
        <ActionError :error="orderErrors[group.id]!" />
      </div>
      <div class="cards">
        <MeatCard
          v-for="(option, index) in options"
          :key="option.id"
          :group="group"
          :option="option"
          :dish-names="dishNames"
          :can-manage="canManage"
          :can-move-up="index > 0"
          :can-move-down="index < options.length - 1"
          :moving="moving === group.id"
          @group="replaceGroup"
          @override="(itemId, kobo) => applyOverride(option.id, itemId, kobo)"
          @exclusion="(itemId, excluded) => applyExclusion(option.id, itemId, excluded)"
          @move="(step) => move(group.id, options, index, step)"
        />
      </div>
      <AddOptionForm :group="group" :dish-names="dishNames" @added="replaceGroup" />
      <div v-if="canManage && archived.length" class="archived" data-test="archived">
        <h3>Archived</h3>
        <ul>
          <li v-for="option in archived" :key="option.id">
            <div class="archived-row">
              <span>{{ option.name }}</span>
              <button
                type="button"
                class="restore"
                :disabled="restoring[option.id]"
                @click="restore(option)"
              >
                Restore
              </button>
            </div>
            <ActionError v-if="restoreErrors[option.id]" :error="restoreErrors[option.id]!" />
          </li>
        </ul>
      </div>
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
.group {
  margin-bottom: 2rem;
}
.group h2 {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
}
.cards {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}
.archived {
  margin-top: 1rem;
}
.archived h3 {
  margin: 0 0 0.5rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.archived ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.archived li {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}
.archived-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  color: var(--color-text-muted);
}
.restore {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-crimson);
  font: 600 0.875rem var(--font-body);
  text-decoration: underline;
  cursor: pointer;
}
@media (min-width: 900px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
