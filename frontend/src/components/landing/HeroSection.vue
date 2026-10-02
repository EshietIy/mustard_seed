<script setup lang="ts">
import { computed } from 'vue';
import IconArrowRight from '@/components/icons/IconArrowRight.vue';
import IconBag from '@/components/icons/IconBag.vue';
import IconClock from '@/components/icons/IconClock.vue';
import IconScooter from '@/components/icons/IconScooter.vue';
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import { landing } from '@/content/landing';
import { useSiteStore } from '@/stores/site';
import { formatNaira, formatTime } from '@/utils/format';

const site = useSiteStore();
const hero = landing.hero;

const hoursFact = computed(() =>
  site.info
    ? `Open daily, ${formatTime(site.info.hours.opensAt)} – ${formatTime(site.info.hours.closesAt)}`
    : null,
);
const deliveryFact = computed(() =>
  site.info
    ? `${formatNaira(site.info.delivery.feeKobo)} delivery anywhere in ${site.info.delivery.area}`
    : null,
);
</script>

<template>
  <section id="top" class="hero" aria-labelledby="hero-title">
    <div class="inner">
      <div class="copy">
        <p class="eyebrow eyebrow--rule">{{ hero.eyebrow }}</p>
        <h1 id="hero-title">
          {{ hero.titleLead }} <em>{{ hero.titleEmphasis }}</em>
        </h1>
        <p class="body">{{ hero.body }}</p>
        <div class="ctas">
          <a href="#menu" class="btn-primary"> {{ hero.primaryCta }} <IconArrowRight /> </a>
          <a href="#story" class="btn-outline-light">{{ hero.secondaryCta }}</a>
        </div>
        <ul class="facts">
          <li v-if="hoursFact"><IconClock class="fact-icon" />{{ hoursFact }}</li>
          <li v-if="deliveryFact"><IconScooter class="fact-icon" />{{ deliveryFact }}</li>
          <li><IconBag class="fact-icon" />{{ hero.pickup }}</li>
        </ul>
      </div>
      <div class="arch-trim">
        <div class="arch">
          <PhotoPlaceholder :label="hero.photoLabel" tone="dark" align="center" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background: var(--color-charcoal);
  color: var(--color-text-on-dark);
}
.inner {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 4rem var(--gutter);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
}
h1 {
  margin: 1rem 0 1.25rem;
  font-size: clamp(2.5rem, 5.5vw, 4rem);
  color: var(--color-cream);
}
h1 em {
  display: block;
  color: var(--color-gold);
  font-weight: 500;
}
.body {
  max-width: 34rem;
  color: var(--color-text-on-dark-muted);
}
.ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1.75rem 0;
}
.ctas a {
  gap: 0.5rem;
  text-decoration: none;
}
.facts {
  list-style: none;
  margin: 0;
  padding: 1.25rem 0 0;
  border-top: 1px solid color-mix(in srgb, var(--color-cream) 15%, transparent);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-on-dark-muted);
}
.facts li {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.fact-icon {
  color: var(--color-gold);
  font-size: 1rem;
}
.arch-trim {
  padding: 10px;
  border-radius: 999px 999px 1.25rem 1.25rem;
  background: repeating-linear-gradient(
    135deg,
    var(--color-crimson) 0 6px,
    var(--color-gold) 6px 12px
  );
}
.arch {
  aspect-ratio: 1 / 0.92;
  border-radius: 999px 999px 0.875rem 0.875rem;
  overflow: hidden;
}

@media (max-width: 860px) {
  .inner {
    grid-template-columns: 1fr;
    padding-block: 2.5rem 3rem;
    gap: 2rem;
  }
  .arch {
    aspect-ratio: 1 / 0.75;
  }
}
</style>
