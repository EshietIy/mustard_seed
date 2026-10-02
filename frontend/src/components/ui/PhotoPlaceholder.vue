<script setup lang="ts">
/** Diagonal-stripe placeholder with a small pill, used until real photography exists. */
withDefaults(
  defineProps<{ label?: string; tone?: 'light' | 'dark'; align?: 'start' | 'center' }>(),
  { label: 'Photo coming', tone: 'light', align: 'start' },
);
</script>

<template>
  <div class="placeholder" :class="[`placeholder--${tone}`, `placeholder--${align}`]">
    <span class="pill">{{ label }}</span>
  </div>
</template>

<style scoped>
.placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  padding: 0.75rem;
}
.placeholder--light {
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-charcoal) 6%, transparent) 0 1px,
      transparent 1px 14px
    ),
    color-mix(in srgb, var(--color-gold) 22%, var(--color-cream));
}
.placeholder--dark {
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-cream) 7%, transparent) 0 1px,
      transparent 1px 16px
    ),
    var(--color-charcoal);
}
.placeholder--center {
  justify-content: center;
  padding-bottom: 1.25rem;
}
.pill {
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: 0.6875rem;
  line-height: 1.4;
}
.placeholder--light .pill {
  background: color-mix(in srgb, var(--color-white) 85%, transparent);
  color: var(--color-text-muted);
}
.placeholder--dark .pill {
  background: color-mix(in srgb, var(--color-charcoal) 85%, var(--color-cream));
  color: var(--color-gold);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.625rem;
  padding: 0.35rem 0.8rem;
}
</style>
