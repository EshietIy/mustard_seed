<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { MenuCategoryId } from '@/api/types';
import IconSearch from '@/components/icons/IconSearch.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { landing } from '@/content/landing';
import { ALL_CATEGORIES, useMenuStore } from '@/stores/menu';
import MenuItemCard from './MenuItemCard.vue';

const menu = useMenuStore();
const copy = landing.menu;
const tabRefs = ref<HTMLButtonElement[]>([]);
const expanded = ref(false);
/** What is in the box; the store keeps the trimmed search, so spaces can still be typed. */
const text = ref(menu.query);

const pills = computed(() => [
  { id: ALL_CATEGORIES, label: copy.allLabel },
  ...menu.categories.map((c) => ({ id: c.id, label: c.label })),
]);

const shown = computed(() =>
  expanded.value ? menu.visibleItems : menu.visibleItems.slice(0, copy.initialCount),
);
const hiddenCount = computed(() => menu.visibleItems.length - shown.value.length);

const resultsMessage = computed(() => {
  if (!menu.query) return '';
  const n = menu.visibleItems.length;
  return `${n} ${n === 1 ? 'dish' : 'dishes'} found`;
});

watch(
  () => menu.query,
  (query) => {
    if (query !== text.value.trim()) text.value = query;
  },
);
watch([() => menu.query, () => menu.activeCategory], () => (expanded.value = false));

function onInput(): void {
  menu.search(text.value);
}

function clearSearch(): void {
  text.value = '';
  menu.search('');
}

async function select(id: MenuCategoryId, focus = false): Promise<void> {
  menu.selectCategory(id);
  if (focus) {
    await nextTick();
    tabRefs.value[pills.value.findIndex((p) => p.id === id)]?.focus();
  }
}

/** WAI-ARIA tabs keyboard pattern: arrows move (and wrap), Home/End jump. */
function onKeydown(event: KeyboardEvent, index: number): void {
  const count = pills.value.length;
  const targets: Record<string, number> = {
    ArrowRight: (index + 1) % count,
    ArrowLeft: (index - 1 + count) % count,
    Home: 0,
    End: count - 1,
  };
  const target = targets[event.key];
  const pill = target === undefined ? undefined : pills.value[target];
  if (!pill) return;
  event.preventDefault();
  void select(pill.id, true);
}
</script>

<template>
  <section id="menu" class="menu" aria-labelledby="menu-title">
    <div class="head">
      <div>
        <h2 id="menu-title">
          {{ copy.titleLead }} <em>{{ copy.titleEmphasis }}</em>
        </h2>
        <p class="lead">{{ copy.body }}</p>
      </div>
      <label class="search">
        <IconSearch class="search-icon" />
        <span class="sr-only">{{ copy.searchLabel }}</span>
        <input
          v-model="text"
          type="search"
          :placeholder="copy.searchLabel"
          :disabled="menu.status !== 'ready'"
          @input="onInput"
        />
      </label>
    </div>

    <div v-if="menu.status === 'error'" class="state">
      <InlineError title="We couldn’t load the menu." :error="menu.error" @retry="menu.load()" />
    </div>

    <div v-else-if="menu.status !== 'ready'" class="state" aria-busy="true">
      <p class="sr-only">Loading the menu…</p>
      <div class="grid">
        <div v-for="n in 4" :key="n" class="skeleton" />
      </div>
    </div>

    <template v-else>
      <div class="tabs" role="tablist" aria-label="Menu categories">
        <button
          v-for="(pill, i) in pills"
          :id="`tab-${pill.id}`"
          :key="pill.id"
          ref="tabRefs"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="pill.id === menu.activeCategory"
          aria-controls="menu-panel"
          :tabindex="pill.id === menu.activeCategory ? 0 : -1"
          @click="select(pill.id)"
          @keydown="onKeydown($event, i)"
        >
          {{ pill.label }}
        </button>
      </div>

      <p class="sr-only" role="status">{{ resultsMessage }}</p>

      <div
        id="menu-panel"
        role="tabpanel"
        :aria-labelledby="`tab-${menu.activeCategory}`"
        tabindex="0"
        class="panel"
      >
        <div v-if="shown.length" class="grid">
          <MenuItemCard v-for="item in shown" :key="item.id" :item="item" />
        </div>
        <div v-else-if="menu.query" class="empty" data-test="no-matches">
          <p>No dishes match “{{ menu.query }}”.</p>
          <button type="button" class="btn-outline" data-test="clear-search" @click="clearSearch">
            {{ copy.clearSearch }}
          </button>
        </div>
        <p v-else class="empty">{{ copy.emptyCategory }}</p>

        <div v-if="hiddenCount > 0" class="more">
          <button type="button" class="btn-outline" data-test="show-more" @click="expanded = true">
            Show full menu ({{ hiddenCount }} more)
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.menu {
  max-width: var(--landing-width);
  margin: 0 auto;
  padding: 3rem var(--gutter) 4rem;
  scroll-margin-top: 5rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem 2rem;
  margin-bottom: 1.25rem;
}
h2 {
  margin: 0 0 0.375rem;
  font-size: clamp(2rem, 4vw, 2.75rem);
}
h2 em {
  color: var(--color-crimson);
  font-weight: 500;
}
.lead {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
.search {
  position: relative;
  flex: 0 1 22rem;
  min-width: min(100%, 16rem);
}
.search-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  translate: 0 -50%;
  color: var(--color-text-muted);
}
.search input {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.5rem 1rem 0.5rem 2.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-charcoal) 5%, var(--color-cream));
  color: var(--color-text);
  font: 0.875rem var(--font-body);
}
.search input:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.tabs {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.25rem 0.25rem 1.25rem;
  margin: 0 -0.25rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}
.tab {
  flex: none;
  min-height: 2.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 500 0.8125rem var(--font-body);
  cursor: pointer;
}
.tab[aria-selected='true'] {
  background: var(--color-charcoal);
  border-color: var(--color-charcoal);
  color: var(--color-cream);
}
.panel:focus-visible {
  border-radius: var(--radius-card);
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.empty {
  margin: 0;
  padding: 2rem;
  text-align: center;
  background: var(--color-white);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
  color: var(--color-text-muted);
}
.empty p {
  margin: 0 0 1rem;
}
.more {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}
.btn-outline {
  min-height: 2.75rem;
  padding: 0.5rem 1.5rem;
  border: 1px solid var(--color-charcoal);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 600 0.875rem var(--font-body);
  cursor: pointer;
}
.btn-outline:hover {
  background: var(--color-cream);
}
.skeleton {
  height: 18rem;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-charcoal) 6%, transparent);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
@media (max-width: 1023px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .grid {
    gap: 0.625rem;
  }
  .search {
    flex-basis: 100%;
  }
}
</style>
