<script setup lang="ts">
import { computed } from 'vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing, PLACEHOLDERS } from '@/content/landing';
import { useSiteStore } from '@/stores/site';

const site = useSiteStore();
const phone = computed(() => site.info?.phoneWhatsapp ?? null);
const telHref = computed(() => (phone.value ? `tel:${phone.value.replace(/[^\d+]/g, '')}` : ''));
</script>

<template>
  <footer class="footer">
    <ZigzagTrim />
    <div class="inner">
      <div>
        <p class="name">{{ landing.brand.fullName }}</p>
        <p class="tagline">{{ landing.footer.tagline }}</p>
      </div>
      <ul class="links">
        <li>
          <a href="#menu">{{ landing.footer.orderOnline }}</a>
        </li>
        <li>
          <a href="#visit">{{ landing.footer.findUs }}</a>
        </li>
        <li>
          <a v-if="phone" :href="telHref">{{ phone }}</a>
          <span v-else>{{ PLACEHOLDERS.phone }}</span>
        </li>
        <li>{{ landing.footer.domain }}</li>
      </ul>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background: var(--color-charcoal);
  color: var(--color-text-on-dark);
}
.inner {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 2.5rem var(--gutter);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
}
.name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--color-cream);
}
.tagline {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-on-dark-muted);
}
.links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  font-size: 0.8125rem;
  color: var(--color-text-on-dark-muted);
}
.links a {
  color: var(--color-cream);
}
</style>
