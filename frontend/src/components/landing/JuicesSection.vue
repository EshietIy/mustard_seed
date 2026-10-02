<script setup lang="ts">
import { ref } from 'vue';
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing } from '@/content/landing';
import { useMenuStore } from '@/stores/menu';

const menu = useMenuStore();
const copy = landing.juices;
const failedImages = ref(new Set<string>());
</script>

<template>
  <section id="juices" class="juices" aria-labelledby="juices-title">
    <ZigzagTrim />
    <div class="inner">
      <div class="copy">
        <p class="eyebrow">{{ copy.eyebrow }}</p>
        <h2 id="juices-title">{{ copy.title }}</h2>
        <p class="body">{{ copy.body }}</p>
        <a href="#menu" class="btn-cream" @click="menu.selectCategory('drinks')">{{ copy.cta }}</a>
      </div>
      <div v-if="menu.freshJuices.length" class="bottles">
        <figure v-for="juice in menu.freshJuices.slice(0, 3)" :key="juice.id" class="bottle">
          <div class="arch">
            <img
              v-if="juice.image && !failedImages.has(juice.id)"
              :src="juice.image.thumbnailUrl"
              :alt="juice.name"
              loading="lazy"
              decoding="async"
              @error="failedImages.add(juice.id)"
            />
            <PhotoPlaceholder v-else tone="dark" label="" class="no-pill" />
          </div>
          <figcaption>{{ juice.name }}</figcaption>
        </figure>
      </div>
    </div>
  </section>
</template>

<style scoped>
.juices {
  background: var(--color-crimson);
  color: var(--color-white);
  scroll-margin-top: 5rem;
}
.inner {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 3.5rem var(--gutter);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
  align-items: center;
}
h2 {
  margin: 0.75rem 0 1rem;
  font-size: clamp(2rem, 4vw, 2.5rem);
  color: var(--color-white);
}
.body {
  max-width: 26rem;
  margin: 0 0 1.5rem;
  color: color-mix(in srgb, var(--color-white) 85%, transparent);
}
.btn-cream {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-pill);
  background: var(--color-cream);
  color: var(--color-crimson);
  font-weight: 700;
  font-size: 0.875rem;
  text-decoration: none;
}
.bottles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  align-items: start;
}
.bottle {
  margin: 0;
  text-align: center;
}
.bottle:nth-child(2) {
  margin-top: 1.5rem;
}
.arch {
  aspect-ratio: 1 / 1.2;
  border-radius: 999px 999px 0.75rem 0.75rem;
  overflow: hidden;
}
.arch img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.no-pill :deep(.pill) {
  display: none;
}
figcaption {
  margin-top: 0.5rem;
  font-family: var(--font-heading);
  font-size: 1.125rem;
  font-weight: 600;
}
@media (max-width: 860px) {
  .inner {
    grid-template-columns: 1fr;
  }
}
</style>
