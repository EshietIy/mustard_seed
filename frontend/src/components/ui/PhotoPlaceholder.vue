<script setup lang="ts">
/**
 * Diagonal-stripe placeholder used until real photography exists. The pill sits top-left on
 * cards and in the middle of the hero arch; an empty label shows the stripes alone.
 */
withDefaults(
  defineProps<{ label?: string; tone?: 'light' | 'dark'; align?: 'start' | 'center' }>(),
  { label: 'Photo coming', tone: 'light', align: 'start' },
);
</script>

<template>
  <div class="placeholder" :class="[`placeholder--${tone}`, `placeholder--${align}`]">
    <span v-if="label" class="pill">{{ label }}</span>
  </div>
</template>

<style scoped>
.placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-start;
  padding: 0.625rem;
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
  align-items: center;
  justify-content: center;
}
.pill {
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: 0.5625rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--color-white) 90%, transparent);
  color: var(--color-charcoal);
}
.placeholder--center .pill {
  background: color-mix(in srgb, var(--color-charcoal) 85%, var(--color-cream));
  color: var(--color-gold);
  font-weight: 500;
  font-size: 0.625rem;
  padding: 0.35rem 0.8rem;
}
</style>
