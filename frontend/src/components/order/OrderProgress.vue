<script setup lang="ts">
import { computed } from 'vue';
import type { Fulfilment } from '@/api/types';

const props = defineProps<{ status: string; fulfilment: Fulfilment }>();

/** Index of the step each status has reached (matches the confirmation email's bar). */
const REACHED: Record<string, number> = {
  paid: 0,
  preparing: 1,
  ready: 2,
  out_for_delivery: 2,
  delivered: 3,
  collected: 3,
};

const steps = computed(() => [
  'Confirmed',
  'Preparing',
  'Ready',
  props.fulfilment === 'delivery' ? 'Delivered' : 'Collected',
]);
const reached = computed(() => REACHED[props.status] ?? -1);
</script>

<template>
  <ol class="progress" aria-label="Order progress">
    <li
      v-for="(label, i) in steps"
      :key="label"
      :class="{ done: i <= reached }"
      :aria-current="i === reached ? 'step' : undefined"
    >
      {{ label }}
    </li>
  </ol>
</template>

<style scoped>
.progress {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  padding-top: 0.625rem;
  border-top: 4px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
li.done {
  border-top-color: var(--color-crimson);
  color: var(--color-charcoal);
}
li[aria-current='step'] {
  color: var(--color-crimson);
}
</style>
