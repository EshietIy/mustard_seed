<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { adminSections } from '@/admin/sections';

// Stands in for a section until its screen is built later in slice 8.
const route = useRoute();
const section = computed(() => adminSections.find((s) => s.name === route.name));
</script>

<template>
  <section class="pending" data-test="admin-pending">
    <h1>{{ section?.label }}</h1>
    <p>{{ section?.description }}</p>
    <p class="note">This screen is being built and will appear here soon.</p>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 0.5rem;
  font-size: 2rem;
}
p {
  margin: 0 0 0.5rem;
}
.note {
  color: var(--color-text-muted);
}
</style>
