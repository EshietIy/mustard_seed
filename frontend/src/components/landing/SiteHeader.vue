<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import IconBag from '@/components/icons/IconBag.vue';
import IconClose from '@/components/icons/IconClose.vue';
import IconMenu from '@/components/icons/IconMenu.vue';
import IconUser from '@/components/icons/IconUser.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import { landing } from '@/content/landing';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';

defineEmits<{ 'open-cart': [] }>();

const cart = useCartStore();
const auth = useAuthStore();
const accountOpen = ref(false);
const menuOpen = ref(false);
const menuToggle = ref<HTMLButtonElement | null>(null);

const orderLabel = computed(
  () => `Your order, ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`,
);

async function signOut(): Promise<void> {
  accountOpen.value = false;
  await auth.signOut();
}

async function closeMenu(returnFocus = false): Promise<void> {
  menuOpen.value = false;
  if (returnFocus) {
    await nextTick();
    menuToggle.value?.focus();
  }
}
</script>

<template>
  <header class="site-header">
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
        <button
          v-else
          type="button"
          class="sign-in"
          data-test="sign-in"
          aria-label="Sign in"
          @click="auth.openSignIn()"
        >
          <IconUser class="sign-in-icon" />
          <span class="sign-in-text" aria-hidden="true">Sign in</span>
        </button>
        <a href="#menu" class="btn-primary order-now" data-test="order-now">
          {{ landing.orderNow }}
        </a>
        <button
          type="button"
          class="cart"
          data-test="open-cart"
          :aria-label="orderLabel"
          @click="$emit('open-cart')"
        >
          <IconBag />
          <span class="count">{{ cart.count }}</span>
        </button>
        <button
          ref="menuToggle"
          type="button"
          class="menu-toggle"
          data-test="menu-toggle"
          aria-label="Menu"
          aria-controls="mobile-menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <IconClose v-if="menuOpen" />
          <IconMenu v-else />
        </button>
      </div>
    </div>

    <nav
      v-if="menuOpen"
      id="mobile-menu"
      class="mobile-menu"
      aria-label="Sections"
      @keydown.esc="closeMenu(true)"
    >
      <a v-for="link in landing.nav" :key="link.href" :href="link.href" @click="closeMenu()">
        {{ link.label }}
      </a>
      <a href="#menu" class="btn-primary" @click="closeMenu()">{{ landing.orderNow }}</a>
    </nav>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--color-white);
  border-bottom: 1px solid var(--color-border);
}
.bar {
  max-width: var(--landing-width);
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
  justify-content: flex-end;
  gap: 1.75rem;
  margin-right: 0.75rem;
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
.sign-in {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.25rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 600 0.8125rem var(--font-body);
  cursor: pointer;
}
.account .sign-in {
  padding-left: 0.25rem;
}
.sign-in-icon {
  font-size: 1rem;
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
.order-now {
  min-height: 2.5rem;
  padding: 0.5rem 1.25rem;
  font-size: 0.8125rem;
  text-decoration: none;
}
.cart,
.menu-toggle {
  position: relative;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border-radius: 50%;
  font-size: 1.125rem;
  cursor: pointer;
}
.cart {
  border: 0;
  background: var(--color-charcoal);
  color: var(--color-cream);
}
.count {
  position: absolute;
  top: -0.3rem;
  right: -0.3rem;
  display: grid;
  place-items: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.25rem;
  border-radius: var(--radius-pill);
  background: var(--color-gold);
  color: var(--color-charcoal);
  font: 700 0.625rem var(--font-body);
}
.menu-toggle {
  display: none;
  border: 1px solid var(--color-border);
  background: var(--color-white);
  color: var(--color-text);
}
.mobile-menu {
  display: grid;
  gap: 0.25rem;
  padding: 0.5rem var(--gutter) 1rem;
  border-top: 1px solid var(--color-border);
}
.mobile-menu a:not(.btn-primary) {
  padding: 0.75rem 0;
  color: var(--color-text);
  font-weight: 500;
  text-decoration: none;
}
.mobile-menu .btn-primary {
  margin-top: 0.5rem;
  text-decoration: none;
}

@media (max-width: 1023px) {
  .sign-in:not(.account .sign-in) {
    width: 2.5rem;
    padding: 0;
    justify-content: center;
  }
  .sign-in-text {
    display: none;
  }
  .nav {
    gap: 1.25rem;
  }
}
@media (max-width: 720px) {
  .nav,
  .order-now {
    display: none;
  }
  .bar {
    grid-template-columns: auto auto;
    justify-content: space-between;
  }
  .menu-toggle {
    display: grid;
  }
}
@media (min-width: 721px) {
  .mobile-menu {
    display: none;
  }
}
</style>
