<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { sectionsFor } from '@/admin/sections';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const sections = computed(() => (auth.user ? sectionsFor(auth.user.role) : []));
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Welcome, {{ auth.user?.firstName || 'back' }}</h1>
    <ul class="cards">
      <li v-for="section in sections" :key="section.name" class="card" data-test="admin-section">
        <h2>{{ section.label }}</h2>
        <p>{{ section.description }}</p>
        <RouterLink :to="{ name: section.name }" class="open">Open {{ section.label }}</RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 1.5rem;
  font-size: 2rem;
}
.cards {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  padding: 1.25rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.card h2 {
  margin: 0 0 0.375rem;
  font-size: 1.375rem;
}
.card p {
  margin: 0 0 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}
.open {
  color: var(--color-crimson);
  font-weight: 600;
  font-size: 0.875rem;
}
</style>
