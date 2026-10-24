<script setup lang="ts">
defineProps<{ checked: boolean; label: string; disabled?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    class="switch"
    :aria-checked="checked"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('toggle')"
  >
    <span class="knob" aria-hidden="true" />
  </button>
</template>

<style scoped>
.switch {
  position: relative;
  flex: none;
  width: 3rem;
  height: 1.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--color-border);
  cursor: pointer;
}
.switch[aria-checked='true'] {
  background: var(--color-charcoal);
}
.switch:disabled {
  opacity: 0.5;
  cursor: progress;
}
.knob {
  position: absolute;
  top: 0.1875rem;
  left: 0.1875rem;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 50%;
  background: var(--color-white);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-charcoal) 30%, transparent);
  transition: transform 0.15s ease;
}
.switch[aria-checked='true'] .knob {
  transform: translateX(1.25rem);
}
@media (prefers-reduced-motion: reduce) {
  .knob {
    transition: none;
  }
}
</style>
