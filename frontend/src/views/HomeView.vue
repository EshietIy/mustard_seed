<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import CartDrawer from '@/components/cart/CartDrawer.vue';
import HeroSection from '@/components/landing/HeroSection.vue';
import HowItWorks from '@/components/landing/HowItWorks.vue';
import JuicesSection from '@/components/landing/JuicesSection.vue';
import MenuSection from '@/components/landing/MenuSection.vue';
import SiteFooter from '@/components/landing/SiteFooter.vue';
import SiteHeader from '@/components/landing/SiteHeader.vue';
import StorySection from '@/components/landing/StorySection.vue';
import VisitSection from '@/components/landing/VisitSection.vue';
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
    const { removed, unavailable } = cart.reconcile(menu.allItems);
    if (removed > 0)
      toast.show('Some items in your order are no longer on the menu and were removed.');
    else if (unavailable > 0) toast.show('Some items in your order have sold out.');
  },
  { immediate: true },
);
</script>

<template>
  <SiteHeader @open-cart="cartOpen = true" />
  <main>
    <HeroSection />
    <HowItWorks />
    <MenuSection />
    <JuicesSection />
    <StorySection />
    <VisitSection />
  </main>
  <SiteFooter />
  <CartDrawer v-model:open="cartOpen" @checkout="goToCheckout" />
  <ToastHost />
</template>
