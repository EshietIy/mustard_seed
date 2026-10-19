<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import CartDrawer from '@/components/cart/CartDrawer.vue';
import HeroSection from '@/components/landing/HeroSection.vue';
import MenuSection from '@/components/landing/MenuSection.vue';
import SiteFooter from '@/components/landing/SiteFooter.vue';
import SiteHeader from '@/components/landing/SiteHeader.vue';
import TopDishes from '@/components/landing/TopDishes.vue';
import ToastHost from '@/components/ui/ToastHost.vue';
import { useCartStore } from '@/stores/cart';
import { useMenuStore } from '@/stores/menu';
import { useSiteStore } from '@/stores/site';
import { useToastStore } from '@/stores/toast';

const menu = useMenuStore();
const site = useSiteStore();
const cart = useCartStore();
const toast = useToastStore();
const cartOpen = ref(false);
const router = useRouter();

async function goToCheckout(): Promise<void> {
  cartOpen.value = false;
  await router.push('/checkout');
}

onMounted(() => {
  if (menu.status === 'idle') void menu.load();
  if (site.status === 'idle') void site.load();
});

// Keep a saved cart in step with the live menu (renamed, repriced or sold-out items).
watch(
  () => menu.status,
  (status) => {
    if (status !== 'ready') return;
    const { removed, unavailable, needsChoice } = cart.reconcile(menu.allItems);
    if (removed > 0)
      toast.show('Some items in your order are no longer on the menu and were removed.');
    else if (unavailable > 0) toast.show('Some items in your order have sold out.');
    else if (needsChoice > 0) toast.show('Some items in your order need you to choose again.');
  },
  { immediate: true },
);
</script>

<template>
  <SiteHeader @open-cart="cartOpen = true" />
  <main>
    <HeroSection />
    <div class="sheet">
      <TopDishes />
      <MenuSection />
    </div>
  </main>
  <SiteFooter />
  <CartDrawer v-model:open="cartOpen" @checkout="goToCheckout" />
  <ToastHost />
</template>

<style scoped>
/* The white panel with rounded top corners that rises over the hero (design). */
.sheet {
  position: relative;
  background: var(--color-white);
  border-radius: 2rem 2rem 0 0;
  margin-top: -1.5rem;
}
</style>
