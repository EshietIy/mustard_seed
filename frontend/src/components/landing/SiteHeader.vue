<script setup lang="ts">
import { computed } from 'vue';
import IconBag from '@/components/icons/IconBag.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing } from '@/content/landing';
import { useCartStore } from '@/stores/cart';
import { useToastStore } from '@/stores/toast';

defineEmits<{ 'open-cart': [] }>();

const cart = useCartStore();
const toast = useToastStore();

const orderLabel = computed(
  () => `Your order, ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`,
);

function signIn(): void {
  // Google sign-in arrives in the next slice.
  toast.show('Sign in with Google is coming soon. You can still build your order.');
}
</script>

<template>
  <header class="site-header">
    <ZigzagTrim size="sm" />
    <div class="bar">
      <a href="#top" class="brand" aria-label="Mustard Seed Restaurant & Bar, home">
        <BrandMark />
        <span class="brand-text">
          <span class="brand-name">{{ landing.brand.name }}</span>
          <span class="brand-sub">{{ landing.brand.subtitle }}</span>
        </span>
      </a>

      <nav class="nav" aria-label="Sections">
        <a v-for="link in landing.nav" :key="link.href" :href="link.href">{{ link.label }}</a>
      </nav>

      <div class="actions">
        <button type="button" class="sign-in" data-test="sign-in" @click="signIn">
          <span class="g" aria-hidden="true">G</span>
          <span class="sign-in-text">Sign in</span>
        </button>
        <button
          type="button"
          class="order"
          data-test="open-cart"
          :aria-label="orderLabel"
          @click="$emit('open-cart')"
        >
          <IconBag />
          <span class="order-text">Your order</span>
          <span class="count">{{ cart.count }}</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--color-cream);
  border-bottom: 1px solid var(--color-border);
}
.bar {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 0.75rem var(--gutter);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  color: var(--color-text);
  text-decoration: none;
}
.brand-text {
  display: grid;
  line-height: 1.1;
}
.brand-name {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 600;
}
.brand-sub {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.nav {
  display: flex;
  justify-content: center;
  gap: 1.75rem;
}
.nav a {
  color: var(--color-text);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
}
.nav a:hover {
  color: var(--color-crimson);
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sign-in,
.order {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  border-radius: var(--radius-pill);
  font: 600 0.8125rem var(--font-body);
  cursor: pointer;
}
.sign-in {
  padding: 0.25rem 0.875rem 0.25rem 0.25rem;
  background: var(--color-white);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.g {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-gold);
  color: var(--color-charcoal);
  font-weight: 700;
}
.order {
  padding: 0.25rem 0.375rem 0.25rem 1rem;
  border: 0;
  background: var(--color-crimson);
  color: var(--color-white);
}
.count {
  display: grid;
  place-items: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.375rem;
  border-radius: var(--radius-pill);
  background: var(--color-gold);
  color: var(--color-charcoal);
  font-size: 0.75rem;
}

@media (max-width: 860px) {
  .bar {
    grid-template-columns: auto auto;
    justify-content: space-between;
    row-gap: 0.5rem;
  }
  .nav {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: space-between;
    gap: 0.75rem;
    overflow-x: auto;
  }
  .nav a {
    font-size: 0.8125rem;
    white-space: nowrap;
  }
}
@media (max-width: 480px) {
  .sign-in {
    padding: 0.25rem;
  }
  .sign-in-text,
  .order-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .order {
    padding: 0.25rem 0.375rem 0.25rem 0.75rem;
  }
}
</style>
