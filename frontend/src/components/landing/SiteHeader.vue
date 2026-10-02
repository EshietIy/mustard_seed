<script setup lang="ts">
import { computed, ref } from 'vue';
import IconBag from '@/components/icons/IconBag.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing } from '@/content/landing';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';

defineEmits<{ 'open-cart': [] }>();

const cart = useCartStore();
const auth = useAuthStore();
const accountOpen = ref(false);

const orderLabel = computed(
  () => `Your order, ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`,
);

async function signOut(): Promise<void> {
  accountOpen.value = false;
  await auth.signOut();
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
        <div v-if="auth.status === 'signed-in' && auth.user" class="account">
          <button
            type="button"
            class="sign-in"
            data-test="account"
            aria-haspopup="menu"
            :aria-expanded="accountOpen"
            :aria-label="`Account: ${auth.user.firstName || auth.user.email}`"
            @click="accountOpen = !accountOpen"
          >
            <img
              v-if="auth.user.avatarUrl"
              :src="auth.user.avatarUrl"
              alt=""
              class="avatar"
              referrerpolicy="no-referrer"
            />
            <span v-else class="g" aria-hidden="true">{{ auth.initial }}</span>
            <span class="sign-in-text">{{ auth.user.firstName || 'Account' }}</span>
          </button>
          <div v-if="accountOpen" class="account-menu" role="menu">
            <button type="button" role="menuitem" data-test="sign-out" @click="signOut">
              Sign out
            </button>
          </div>
        </div>
        <button v-else type="button" class="sign-in" data-test="sign-in" @click="auth.openSignIn()">
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
.account {
  position: relative;
}
.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  object-fit: cover;
}
.account-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.375rem);
  min-width: 9rem;
  padding: 0.375rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-charcoal) 15%, transparent);
}
.account-menu button {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--color-text);
  font: 600 0.875rem var(--font-body);
  text-align: left;
  cursor: pointer;
}
.account-menu button:hover {
  background: var(--color-surface-soft);
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
