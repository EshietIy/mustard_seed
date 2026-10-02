<script setup lang="ts">
import { useToastStore } from '@/stores/toast';

const toast = useToastStore();
</script>

<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <p v-for="m in toast.messages" :key="m.id" class="toast" @click="toast.dismiss(m.id)">
        {{ m.text }}
      </p>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  z-index: 200;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  display: grid;
  gap: 0.5rem;
  width: min(26rem, calc(100vw - 2rem));
  pointer-events: none;
}
.toast {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-card);
  background: var(--color-charcoal);
  color: var(--color-cream);
  font-size: 0.875rem;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-charcoal) 25%, transparent);
  pointer-events: auto;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
