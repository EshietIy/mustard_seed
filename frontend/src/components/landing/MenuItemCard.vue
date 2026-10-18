<script setup lang="ts">
import { ref } from 'vue';
import type { MenuItem } from '@/api/types';
import IconPlus from '@/components/icons/IconPlus.vue';
import OptionSheet from '@/components/menu/OptionSheet.vue';
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import { useCartStore } from '@/stores/cart';
import { useToastStore } from '@/stores/toast';
import { priceLabel } from '@/utils/format';

/** `compact` is the Top dishes card: dark photo, no description or badge. */
const props = withDefaults(defineProps<{ item: MenuItem; variant?: 'full' | 'compact' }>(), {
  variant: 'full',
});

const cart = useCartStore();
const toast = useToastStore();
const imageFailed = ref(false);
const choosing = ref(false);
const hasChoices = () => props.item.optionGroups.length > 0;

async function add(optionIds: string[] = []): Promise<void> {
  const names = props.item.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .map((o) => o.name);
  const label = names.length ? `${props.item.name} (${names.join(', ')})` : props.item.name;
  if (await cart.add(props.item, optionIds)) toast.show(`Added ${label} to your order`);
  else if (props.item.isAvailable) toast.show(`You've reached the limit for ${label}.`);
}

function onAdd(): void {
  if (hasChoices()) choosing.value = true;
  else void add();
}

function addWithOptions(optionIds: string[]): void {
  choosing.value = false;
  void add(optionIds);
}
</script>

<template>
  <article class="card" :class="`card--${variant}`">
    <div class="media">
      <img
        v-if="item.image && !imageFailed"
        :src="item.image.thumbnailUrl"
        :alt="item.name"
        loading="lazy"
        decoding="async"
        width="400"
        height="260"
        @error="imageFailed = true"
      />
      <PhotoPlaceholder v-else-if="variant === 'compact'" tone="dark" />
      <PhotoPlaceholder v-else label="" />
      <span v-if="item.isHouseSignature && variant === 'full'" class="badge" data-test="signature">
        Signature
      </span>
      <button
        v-if="item.isAvailable"
        type="button"
        class="add"
        :aria-label="
          item.optionGroups.length
            ? `Choose options for ${item.name}`
            : `Add ${item.name} to your order`
        "
        :aria-haspopup="item.optionGroups.length ? 'dialog' : undefined"
        @click="onAdd"
      >
        <IconPlus />
      </button>
      <button v-else type="button" class="sold-out" disabled>Sold out</button>
    </div>
    <div class="body">
      <h3>{{ item.name }}</h3>
      <p v-if="item.description && variant === 'full'" class="description">
        {{ item.description }}
      </p>
      <p class="price">{{ priceLabel(item.priceKobo) }}</p>
    </div>
    <OptionSheet v-if="choosing" :item="item" @add="addWithOptions" @close="choosing = false" />
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.media {
  position: relative;
  aspect-ratio: 400 / 260;
}
.card--compact .media {
  aspect-ratio: 400 / 290;
}
.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.badge {
  position: absolute;
  top: 0.625rem;
  left: 0.625rem;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-pill);
  background: var(--color-charcoal);
  color: var(--color-gold);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.add {
  position: absolute;
  right: 0.625rem;
  bottom: 0.625rem;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 2px solid var(--color-white);
  border-radius: 50%;
  background: var(--color-crimson);
  color: var(--color-white);
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-charcoal) 25%, transparent);
}
.add:hover {
  background: color-mix(in srgb, var(--color-crimson) 88%, var(--color-charcoal));
}
.sold-out {
  position: absolute;
  right: 0.625rem;
  bottom: 0.625rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-cream);
  color: var(--color-text-muted);
  font: 600 0.75rem var(--font-body);
  cursor: not-allowed;
}
.body {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 0.875rem 1rem 1rem;
}
h3 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}
.description {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--color-text-muted);
}
.price {
  margin: auto 0 0;
  font-weight: 700;
  font-size: 0.8125rem;
}
.card--compact .body {
  min-height: 4.5rem;
}
.card--compact .price {
  margin-top: 0;
}
</style>
