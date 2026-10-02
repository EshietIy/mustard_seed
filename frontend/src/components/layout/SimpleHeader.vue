<script setup lang="ts">
import { RouterLink } from 'vue-router';
import BrandMark from '@/components/ui/BrandMark.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing } from '@/content/landing';
</script>

<template>
  <header class="simple-header">
    <ZigzagTrim size="sm" />
    <div class="bar">
      <RouterLink to="/" class="brand" aria-label="Mustard Seed Restaurant & Bar, back to the menu">
        <BrandMark />
        <span class="brand-text">
          <span class="brand-name">{{ landing.brand.name }}</span>
          <span class="brand-sub">{{ landing.brand.subtitle }}</span>
        </span>
      </RouterLink>
      <RouterLink to="/" class="back">Back to the menu</RouterLink>
    </div>
  </header>
</template>

<style scoped>
.simple-header {
  background: var(--color-cream);
  border-bottom: 1px solid var(--color-border);
}
.bar {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 0.75rem var(--gutter);
  display: flex;
  justify-content: space-between;
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
.back {
  color: var(--color-crimson);
  font-weight: 600;
  font-size: 0.875rem;
}
</style>
