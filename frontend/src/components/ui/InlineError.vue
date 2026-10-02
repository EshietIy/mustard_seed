<script setup lang="ts">
import type { ApiError } from '@/api/client';
import IconAlert from '@/components/icons/IconAlert.vue';

defineProps<{ title: string; error: ApiError | null }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="inline-error" role="alert">
    <IconAlert class="icon" />
    <div>
      <p class="title">{{ title }}</p>
      <p class="message">{{ error?.message ?? 'Please try again.' }}</p>
      <slot />
      <button type="button" class="btn-primary" @click="$emit('retry')">Try again</button>
      <p v-if="error?.requestId" class="reference">Reference: {{ error.requestId }}</p>
    </div>
  </div>
</template>

<style scoped>
.inline-error {
  display: flex;
  gap: 0.75rem;
  padding: 1.25rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-crimson);
  border-radius: var(--radius-card);
}
.icon {
  flex: none;
  font-size: 1.5rem;
  color: var(--color-crimson);
}
.title {
  margin: 0;
  font-weight: 700;
}
.message {
  margin: 0.25rem 0 1rem;
  color: var(--color-text-muted);
}
.reference {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
