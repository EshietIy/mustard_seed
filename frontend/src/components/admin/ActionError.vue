<script setup lang="ts">
import type { ApiError } from '@/api/client';

/** A short failure note under one control: the friendly message, plus the reference if any. */
defineProps<{ error: ApiError | string }>();
</script>

<template>
  <p class="action-error" role="alert">
    {{ typeof error === 'string' ? error : error.message }}
    <span v-if="typeof error !== 'string' && error.requestId" class="reference">
      Reference: {{ error.requestId }}
    </span>
  </p>
</template>

<style scoped>
.action-error {
  margin: 0.375rem 0 0;
  font-size: 0.875rem;
  color: var(--color-crimson);
}
.reference {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
