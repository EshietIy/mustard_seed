<script setup lang="ts">
import { onMounted } from 'vue';
import { useConfigStore } from '@/stores/config';

const config = useConfigStore();

onMounted(() => {
  if (config.status === 'idle') void config.load();
});
</script>

<template>
  <div v-if="config.isTestMode" class="test-mode-banner" role="status">
    TEST MODE: payments are simulated. No real money is charged.
  </div>
</template>

<style scoped>
.test-mode-banner {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 0.5rem 1rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: var(--color-charcoal);
  color: var(--color-gold);
  border-bottom: 2px solid var(--color-crimson);
}
</style>
