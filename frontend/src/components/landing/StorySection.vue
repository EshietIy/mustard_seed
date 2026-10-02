<script setup lang="ts">
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing } from '@/content/landing';

const story = landing.story;
</script>

<template>
  <section id="story" class="story" aria-labelledby="story-title">
    <div class="photo">
      <PhotoPlaceholder :label="story.photoLabel" />
    </div>
    <div class="copy">
      <p class="eyebrow eyebrow--crimson">{{ story.eyebrow }}</p>
      <h2 id="story-title">
        {{ story.titleLead }}<br />
        <em>{{ story.titleEmphasis }}</em> {{ story.titleTail }}
      </h2>
      <p class="body">{{ story.body }}</p>
      <p class="body">{{ story.founderLine }}</p>
      <ZigzagTrim size="sm" class="trim" />
    </div>
  </section>
</template>

<style scoped>
.story {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 4rem var(--gutter);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  scroll-margin-top: 5rem;
}
.photo {
  aspect-ratio: 4 / 3.1;
  border-radius: var(--radius-card);
  overflow: hidden;
}
h2 {
  margin: 0.75rem 0 1.25rem;
  font-size: clamp(2rem, 4vw, 2.5rem);
}
h2 em {
  color: var(--color-crimson);
  font-weight: 500;
}
.body {
  color: var(--color-text-muted);
}
.trim {
  width: 5rem;
  margin-top: 1rem;
}
@media (max-width: 860px) {
  .story {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}
</style>
