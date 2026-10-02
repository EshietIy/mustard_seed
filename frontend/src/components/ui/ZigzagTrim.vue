<script setup lang="ts">
/** Crimson-and-gold chevron trim from the design. Purely decorative. */
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' });
</script>

<template>
  <div class="zigzag" :class="`zigzag--${size}`" aria-hidden="true" />
</template>

<style scoped>
.zigzag {
  --zz: 12px;
  height: calc(var(--zz) * 0.75);
  background:
    linear-gradient(135deg, var(--color-crimson) 33%, transparent 33.5%) 0 0 / var(--zz) 100%,
    linear-gradient(225deg, var(--color-crimson) 33%, transparent 33.5%) 0 0 / var(--zz) 100%,
    var(--color-gold);
}
.zigzag--sm {
  --zz: 8px;
}
</style>
