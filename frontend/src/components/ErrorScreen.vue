<script setup lang="ts">
import { computed } from 'vue';
import { ApiError } from '@/api/client';

const props = defineProps<{ error: unknown }>();
defineEmits<{ retry: [] }>();

const requestId = computed(() =>
  props.error instanceof ApiError ? props.error.requestId : undefined,
);
</script>

<template>
  <section class="error-screen" role="alert">
    <p class="eyebrow">Sorry about that</p>
    <h1>Something went wrong.</h1>
    <p class="body">Please try again. If it keeps happening, call or WhatsApp us.</p>
    <button type="button" class="btn-primary" @click="$emit('retry')">Try again</button>
    <p v-if="requestId" class="reference">Reference: {{ requestId }}</p>
  </section>
</template>

<style scoped>
.error-screen {
  max-width: 32rem;
  margin: 4rem auto;
  padding: 2rem 1.5rem;
  text-align: center;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.eyebrow {
  color: var(--color-crimson);
}
h1 {
  margin: 0.5rem 0 1rem;
}
.body {
  color: var(--color-text-muted);
  margin-bottom: 1.5rem;
}
.reference {
  margin-top: 1.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
