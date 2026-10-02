<script setup lang="ts">
import InlineError from '@/components/ui/InlineError.vue';
import { landing, PLACEHOLDERS } from '@/content/landing';
import { useSiteStore } from '@/stores/site';
import { formatTime } from '@/utils/format';

const site = useSiteStore();
const visit = landing.visit;
</script>

<template>
  <section id="visit" class="visit" aria-labelledby="visit-title">
    <div class="inner">
      <h2 id="visit-title">{{ visit.title }}</h2>

      <InlineError
        v-if="site.status === 'error'"
        title="We couldn’t load our locations."
        :error="site.error"
        @retry="site.load()"
      />

      <div v-else-if="!site.info" class="cards" aria-busy="true">
        <p class="sr-only">Loading our locations…</p>
        <div v-for="n in 3" :key="n" class="card skeleton" />
      </div>

      <div v-else class="cards">
        <article v-for="branch in site.info.branches" :key="branch.id" class="card">
          <p class="eyebrow eyebrow--crimson">{{ visit.roleLabel[branch.role] }}</p>
          <h3>{{ branch.city }}</h3>
          <address>
            {{ branch.streetAddress ?? PLACEHOLDERS.address(branch.city) }}<br />
            {{ branch.state }}
          </address>
          <p class="note">
            {{ branch.onlineOrderingEnabled ? visit.onlineAvailable : visit.onlineComingSoon }}
          </p>
        </article>
        <article class="card card--dark">
          <p class="eyebrow">{{ visit.hoursEyebrow }}</p>
          <h3>
            {{ formatTime(site.info.hours.opensAt) }} – {{ formatTime(site.info.hours.closesAt) }}
            daily
          </h3>
          <p class="note">
            Online orders close at {{ formatTime(site.info.hours.onlineOrdersCloseAt) }}.<br />
            {{ visit.events }}
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.visit {
  background: color-mix(in srgb, var(--color-charcoal) 5%, var(--color-cream));
  scroll-margin-top: 5rem;
}
.inner {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 3.5rem var(--gutter) 4rem;
}
h2 {
  margin: 0 0 1.5rem;
  font-size: clamp(2rem, 4vw, 2.5rem);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
}
.card {
  padding: 1.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.card--dark {
  background: var(--color-charcoal);
  border-color: var(--color-charcoal);
  color: var(--color-text-on-dark);
}
h3 {
  margin: 0.5rem 0 0.75rem;
  font-size: 1.75rem;
}
.card--dark h3 {
  color: var(--color-cream);
}
address {
  font-style: normal;
  font-size: 0.875rem;
}
.note {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.card--dark .note {
  color: var(--color-text-on-dark-muted);
}
.skeleton {
  min-height: 11rem;
  background: color-mix(in srgb, var(--color-charcoal) 6%, transparent);
  border-color: transparent;
}
</style>
