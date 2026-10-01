<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="not-found">
    <p class="eyebrow">Page not found</p>
    <h1>We couldn't find that page.</h1>
    <RouterLink to="/" class="btn-primary">Back to the menu</RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  max-width: 32rem;
  margin: 4rem auto;
  padding: 0 1.25rem;
  text-align: center;
}
.btn-primary {
  text-decoration: none;
}
</style>
