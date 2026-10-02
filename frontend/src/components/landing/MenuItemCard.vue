<script setup lang="ts">
import { ref } from 'vue';
import type { MenuItem } from '@/api/types';
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import { useCartStore } from '@/stores/cart';
import { useToastStore } from '@/stores/toast';
import { priceLabel } from '@/utils/format';

const props = defineProps<{ item: MenuItem }>();

const cart = useCartStore();
const toast = useToastStore();
const imageFailed = ref(false);

function add(): void {
  if (cart.add(props.item)) toast.show(`Added ${props.item.name} to your order`);
  else if (props.item.isAvailable) toast.show(`You've reached the limit for ${props.item.name}.`);
}
</script>

<template>
  <article class="card">
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
      <PhotoPlaceholder v-else />
      <span v-if="item.isHouseSignature" class="badge">House signature</span>
    </div>
    <div class="body">
      <h3>{{ item.name }}</h3>
      <p v-if="item.description" class="description">{{ item.description }}</p>
      <div class="footer">
        <span class="price">{{ priceLabel(item.priceKobo) }}</span>
        <button
          v-if="item.isAvailable"
          type="button"
          class="btn-primary btn-sm"
          :aria-label="`Add ${item.name} to your order`"
          @click="add"
        >
          Add
        </button>
        <button v-else type="button" class="btn-sold-out btn-sm" disabled>Sold out</button>
      </div>
    </div>
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
.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.badge {
  position: absolute;
  top: 0.625rem;
  left: 0.625rem;
  padding: 0.2rem 0.55rem;
  border-radius: var(--radius-pill);
  background: var(--color-charcoal);
  color: var(--color-gold);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.body {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 1rem 1rem 1.125rem;
}
h3 {
  margin: 0 0 0.375rem;
  font-size: 1.25rem;
}
.description {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-muted);
}
.footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.price {
  font-weight: 700;
  font-size: 0.875rem;
}
.btn-sold-out {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-cream);
  color: var(--color-text-muted);
  font: 600 0.8125rem var(--font-body);
  cursor: not-allowed;
}
</style>
