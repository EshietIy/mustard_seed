<script setup lang="ts">
import { landing } from '@/content/landing';
</script>

<template>
  <section class="how" aria-label="How ordering works">
    <ol class="steps">
      <li v-for="(step, i) in landing.steps" :key="step.title" class="step">
        <span class="number" aria-hidden="true">{{ i + 1 }}</span>
        <div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.how {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 2.5rem var(--gutter) 1rem;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.75rem;
}
.step {
  display: flex;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.number {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  line-height: 1.2;
  color: var(--color-crimson);
}
h3 {
  margin: 0 0 0.25rem;
  font-family: var(--font-body);
  font-size: 0.9375rem;
  font-weight: 700;
}
p {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
</style>
