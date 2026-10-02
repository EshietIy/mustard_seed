<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { MenuCategoryId } from '@/api/types';
import InlineError from '@/components/ui/InlineError.vue';
import { landing } from '@/content/landing';
import { useMenuStore } from '@/stores/menu';
import MenuItemCard from './MenuItemCard.vue';

const menu = useMenuStore();
const tabRefs = ref<HTMLButtonElement[]>([]);

const active = computed(
  () => menu.categories.find((c) => c.id === menu.activeCategory) ?? menu.categories[0],
);

async function select(id: MenuCategoryId, focus = false): Promise<void> {
  menu.selectCategory(id);
  if (focus) {
    await nextTick();
    tabRefs.value[menu.categories.findIndex((c) => c.id === id)]?.focus();
  }
}

/** WAI-ARIA tabs keyboard pattern: arrows move (and wrap), Home/End jump. */
function onKeydown(event: KeyboardEvent, index: number): void {
  const count = menu.categories.length;
  const targets: Record<string, number> = {
    ArrowRight: (index + 1) % count,
    ArrowLeft: (index - 1 + count) % count,
    Home: 0,
    End: count - 1,
  };
  const target = targets[event.key];
  const category = target === undefined ? undefined : menu.categories[target];
  if (!category) return;
  event.preventDefault();
  void select(category.id, true);
}
</script>

<template>
  <section id="menu" class="menu" aria-labelledby="menu-title">
    <p class="eyebrow eyebrow--crimson">{{ landing.menu.eyebrow }}</p>
    <h2 id="menu-title">{{ landing.menu.title }}</h2>

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
          v-for="(category, i) in menu.categories"
          :id="`tab-${category.id}`"
          :key="category.id"
          ref="tabRefs"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="category.id === active?.id"
          :aria-controls="`panel-${category.id}`"
          :tabindex="category.id === active?.id ? 0 : -1"
          @click="select(category.id)"
          @keydown="onKeydown($event, i)"
        >
          {{ category.label }}
        </button>
      </div>

      <div
        v-if="active"
        :id="`panel-${active.id}`"
        role="tabpanel"
        :aria-labelledby="`tab-${active.id}`"
        tabindex="0"
        class="panel"
      >
        <div v-if="active.items.length" class="grid">
          <MenuItemCard v-for="item in active.items" :key="item.id" :item="item" />
        </div>
        <p v-else class="empty">{{ landing.menu.emptyCategory }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.menu {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 3.5rem var(--gutter) 4rem;
  scroll-margin-top: 5rem;
}
h2 {
  margin: 0.5rem 0 1.5rem;
  font-size: clamp(2rem, 4vw, 2.75rem);
}
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  overflow-x: auto;
  padding: 0.25rem;
  margin-inline: -0.25rem;
}
.tab {
  flex: none;
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 600 0.8125rem var(--font-body);
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
  padding: 2rem;
  text-align: center;
  background: var(--color-white);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
  color: var(--color-text-muted);
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
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
}
</style>
