<script setup lang="ts">
import { ref } from 'vue';
import IconChevronLeft from '@/components/icons/IconChevronLeft.vue';
import IconChevronRight from '@/components/icons/IconChevronRight.vue';
import { landing } from '@/content/landing';
import { useMenuStore } from '@/stores/menu';
import MenuItemCard from './MenuItemCard.vue';

const menu = useMenuStore();
const copy = landing.topDishes;
const track = ref<HTMLElement | null>(null);

/** Moves the row by most of its visible width, so the next cards come into view. */
function scroll(direction: 1 | -1): void {
  const el = track.value;
  if (!el) return;
  el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.75), behavior: 'smooth' });
}
</script>

<template>
  <section
    v-if="menu.status !== 'error' && (menu.status !== 'ready' || menu.houseSignatures.length)"
    id="top-dishes"
    class="top"
    aria-labelledby="top-dishes-title"
  >
    <div class="head">
      <div>
        <p class="eyebrow eyebrow--crimson">{{ copy.eyebrow }}</p>
        <h2 id="top-dishes-title">{{ copy.title }}</h2>
      </div>
      <div class="arrows">
        <button type="button" class="arrow" aria-label="Previous dishes" @click="scroll(-1)">
          <IconChevronLeft />
        </button>
        <button type="button" class="arrow arrow--dark" aria-label="Next dishes" @click="scroll(1)">
          <IconChevronRight />
        </button>
      </div>
    </div>

    <div v-if="menu.status !== 'ready'" class="track" aria-busy="true">
      <div v-for="n in 4" :key="n" class="slot skeleton" />
    </div>
    <div v-else ref="track" class="track" data-test="track">
      <div v-for="item in menu.houseSignatures" :key="item.id" class="slot">
        <MenuItemCard :item="item" variant="compact" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.top {
  max-width: var(--landing-width);
  margin: 0 auto;
  padding: 2.5rem var(--gutter) 1rem;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
h2 {
  margin: 0.25rem 0 0;
  font-size: clamp(1.875rem, 4vw, 2.5rem);
}
.arrows {
  display: flex;
  gap: 0.5rem;
}
.arrow {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-white);
  color: var(--color-text);
  font-size: 1rem;
  cursor: pointer;
}
.arrow--dark {
  border-color: var(--color-charcoal);
  background: var(--color-charcoal);
  color: var(--color-cream);
}
.track {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding-bottom: 0.25rem;
}
.track::-webkit-scrollbar {
  display: none;
}
.slot {
  flex: 0 0 calc((100% - 4 * 1rem) / 4.6);
  min-width: 11rem;
  scroll-snap-align: start;
}
.slot > :deep(.card) {
  height: 100%;
}
.skeleton {
  height: 14rem;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-charcoal) 6%, transparent);
}
@media (max-width: 1023px) {
  .slot {
    flex-basis: calc((100% - 2 * 1rem) / 3);
  }
}
@media (max-width: 600px) {
  .slot {
    flex-basis: 70%;
  }
}
</style>
