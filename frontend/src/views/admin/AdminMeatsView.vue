<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminOptionGroup, Menu } from '@/api/types';
import AddOptionForm from '@/components/admin/AddOptionForm.vue';
import MeatCard from '@/components/admin/MeatCard.vue';
import InlineError from '@/components/ui/InlineError.vue';

/** Meats & prices (AGENT.md section 11, slice 8): every live choice group and its options. */
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const groups = ref<AdminOptionGroup[]>([]);
const dishNames = ref<Record<string, string>>({});

const liveGroups = computed(() =>
  groups.value
    .filter((g) => !g.archived)
    .map((g) => ({
      group: g,
      options: g.options
        .filter((o) => !o.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    })),
);

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
      v-for="{ group, options } in liveGroups"
      v-else
      :key="group.id"
      class="group"
      :aria-labelledby="`group-${group.id}`"
    >
      <h2 :id="`group-${group.id}`">{{ group.name }}</h2>
      <div class="cards">
        <MeatCard
          v-for="option in options"
          :key="option.id"
          :group="group"
          :option="option"
          :dish-names="dishNames"
          @group="replaceGroup"
          @override="(itemId, kobo) => applyOverride(option.id, itemId, kobo)"
        />
      </div>
      <AddOptionForm :group="group" :dish-names="dishNames" @added="replaceGroup" />
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
@media (min-width: 900px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
