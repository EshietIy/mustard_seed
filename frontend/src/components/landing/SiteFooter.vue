<script setup lang="ts">
import { computed } from 'vue';
import InlineError from '@/components/ui/InlineError.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing, PLACEHOLDERS } from '@/content/landing';
import { useSiteStore } from '@/stores/site';
import { formatTime } from '@/utils/format';

const site = useSiteStore();
const copy = landing.footer;
const year = new Date().getFullYear();
const phone = computed(() => site.info?.phoneWhatsapp ?? null);
const telHref = computed(() => (phone.value ? `tel:${phone.value.replace(/[^\d+]/g, '')}` : ''));
</script>

<template>
  <footer id="visit" class="footer">
    <ZigzagTrim />
    <div class="inner">
      <div class="columns">
        <div class="brand">
          <p class="name">{{ landing.brand.name }}</p>
          <p class="tagline">{{ copy.tagline }}</p>
        </div>

        <div v-if="site.status === 'error'" class="state">
          <InlineError
            title="We couldn’t load our locations and hours."
            :error="site.error"
            @retry="site.load()"
          />
        </div>

        <div v-else-if="!site.info" class="state" aria-busy="true">
          <p class="sr-only">Loading our locations…</p>
        </div>

        <template v-else>
          <div v-for="branch in site.info.branches" :key="branch.id" data-test="branch">
            <h3 class="eyebrow">
              {{ branch.city }}
              <template v-if="branch.role === 'headquarters'">
                {{ copy.headquartersSuffix }}
              </template>
            </h3>
            <address>
              {{ branch.streetAddress ?? PLACEHOLDERS.address(branch.city) }}<br />
              {{ branch.state }}
            </address>
            <p class="status">
              {{ branch.onlineOrderingEnabled ? copy.onlineAvailable : copy.onlineComingSoon }}
            </p>
          </div>
          <div data-test="hours">
            <h3 class="eyebrow">{{ copy.hoursTitle }}</h3>
            <p>
              Daily {{ formatTime(site.info.hours.opensAt) }} –
              {{ formatTime(site.info.hours.closesAt) }}<br />
              Online orders close {{ formatTime(site.info.hours.onlineOrdersCloseAt) }}
            </p>
            <p>
              <a v-if="phone" :href="telHref">{{ phone }}</a>
              <span v-else>{{ PLACEHOLDERS.phone }}</span>
            </p>
          </div>
        </template>
      </div>

      <p class="legal" data-test="legal">
        © {{ year }} {{ landing.brand.fullName }} · {{ landing.brand.domain }}
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background: var(--color-charcoal);
  color: var(--color-text-on-dark-muted);
  font-size: 0.8125rem;
  scroll-margin-top: 5rem;
}
.inner {
  max-width: var(--landing-width);
  margin: 0 auto;
  padding: 2.5rem var(--gutter) 1.5rem;
}
.columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2rem;
  padding-bottom: 1.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-cream) 12%, transparent);
}
.state {
  grid-column: span 3;
  color: var(--color-text);
}
.name {
  margin: 0 0 0.75rem;
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-cream);
}
.tagline {
  margin: 0;
  max-width: 18rem;
}
h3.eyebrow {
  margin: 0.375rem 0 0.75rem;
  font-family: var(--font-body);
  line-height: 1.4;
}
address,
.columns p {
  margin: 0 0 0.625rem;
  font-style: normal;
}
.status {
  color: var(--color-cream);
}
a {
  color: var(--color-cream);
}
.legal {
  margin: 1.25rem 0 0;
  font-size: 0.75rem;
}
@media (max-width: 1023px) {
  .columns {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .brand {
    grid-column: 1 / -1;
  }
  .state {
    grid-column: 1 / -1;
  }
}
@media (max-width: 600px) {
  .columns {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}
</style>
