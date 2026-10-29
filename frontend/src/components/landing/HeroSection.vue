<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import IconChevronLeft from '@/components/icons/IconChevronLeft.vue';
import IconChevronRight from '@/components/icons/IconChevronRight.vue';
import IconClock from '@/components/icons/IconClock.vue';
import IconPause from '@/components/icons/IconPause.vue';
import IconPin from '@/components/icons/IconPin.vue';
import IconPlay from '@/components/icons/IconPlay.vue';
import IconSearch from '@/components/icons/IconSearch.vue';
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import { landing } from '@/content/landing';
import { useMenuStore } from '@/stores/menu';
import { useSiteStore } from '@/stores/site';
import { formatNaira, formatTime } from '@/utils/format';

const menu = useMenuStore();
const site = useSiteStore();
const hero = landing.hero;
const text = ref('');
const slideIndex = ref(0);

const slide = computed(() => hero.slides[slideIndex.value]!);
const hours = computed(() => site.info?.hours ?? null);
const delivery = computed(() => site.info?.delivery ?? null);

/** How long each photo shows before the slideshow moves on. */
const AUTOPLAY_MS = 6_000;

const prefersLessMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
// A pause button is required for anything that moves by itself (WCAG 2.2.2).
const paused = ref(prefersLessMotion());
const pointerInside = ref(false);
const focusInside = ref(false);
const playing = computed(() => !paused.value && !pointerInside.value && !focusInside.value);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Starts the wait for the next photo again, so a visitor's choice gets the full time. */
function restartTimer(): void {
  clearTimeout(timer);
  timer = undefined;
  if (!playing.value) return;
  timer = setTimeout(() => {
    // A hidden tab just keeps waiting, so the visitor comes back to the photo they left.
    if (document.hidden) restartTimer();
    else show(slideIndex.value + 1);
  }, AUTOPLAY_MS);
}

function show(index: number): void {
  const count = hero.slides.length;
  slideIndex.value = (index + count) % count;
  restartTimer();
}

/** A mouse click leaves focus on the button, so the pointer leaving ends that pause too. */
function leave(): void {
  pointerInside.value = false;
  focusInside.value = false;
}

function onFocusOut(event: FocusEvent): void {
  const art = event.currentTarget as HTMLElement;
  if (!art.contains(event.relatedTarget as Node | null)) focusInside.value = false;
}

watch(playing, restartTimer);
onMounted(restartTimer);
onBeforeUnmount(() => clearTimeout(timer));

function search(query: string): void {
  menu.search(query);
  document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<template>
  <section id="top" class="hero" aria-labelledby="hero-title">
    <div class="inner">
      <div class="copy">
        <p class="badge">
          <BrandMark class="badge-mark" />
          {{ hero.badge }}
        </p>
        <h1 id="hero-title">
          {{ hero.titleLead }}<br />
          {{ hero.titleTail }} <em>{{ hero.titleEmphasis }}</em>
        </h1>
        <p class="body">{{ hero.body }}</p>

        <form class="search" role="search" @submit.prevent="search(text)">
          <IconSearch class="search-icon" />
          <label for="hero-search" class="sr-only">{{ hero.searchLabel }}</label>
          <input
            id="hero-search"
            v-model="text"
            type="search"
            :placeholder="hero.searchPlaceholder"
            autocomplete="off"
          />
          <button type="submit" class="btn-primary">{{ hero.searchButton }}</button>
        </form>

        <div class="quick" data-test="quick-find">
          <span id="quick-find-label" class="quick-label">{{ hero.quickFindLabel }}</span>
          <ul aria-labelledby="quick-find-label">
            <li v-for="word in hero.quickFind" :key="word">
              <button type="button" class="chip" @click="search(word)">{{ word }}</button>
            </li>
          </ul>
        </div>
      </div>

      <div
        class="art"
        data-test="carousel"
        @mouseenter="pointerInside = true"
        @mouseleave="leave"
        @focusin="focusInside = true"
        @focusout="onFocusOut"
      >
        <div class="blob" aria-hidden="true" />
        <div class="arch-trim">
          <div class="arch">
            <Transition name="slide">
              <div :key="slideIndex" class="slide">
                <PhotoPlaceholder :label="slide.photoLabel" tone="dark" align="center" />
              </div>
            </Transition>
          </div>
        </div>

        <div class="card card--branches">
          <span class="card-icon"><IconPin /></span>
          <span>
            <strong>{{ hero.branchesCard.title }}</strong>
            <small>{{ hero.branchesCard.body }}</small>
          </span>
        </div>
        <div v-if="delivery" class="card card--delivery">
          <span class="eyebrow">Delivery</span>
          <strong>{{ formatNaira(delivery.feeKobo) }}</strong>
          <small>anywhere in {{ delivery.area }}</small>
        </div>
        <div class="card card--juices"><span class="dot" />{{ hero.juicesCard }}</div>
        <div v-if="hours" class="card card--hours">
          <span class="card-icon card-icon--dark"><IconClock /></span>
          <span>
            <strong>Open {{ formatTime(hours.opensAt) }} – {{ formatTime(hours.closesAt) }}</strong>
            <small>Online orders until {{ formatTime(hours.onlineOrdersCloseAt) }}</small>
          </span>
        </div>

        <div class="controls">
          <button
            type="button"
            class="ctl"
            aria-label="Previous photo"
            @click="show(slideIndex - 1)"
          >
            <IconChevronLeft />
          </button>
          <div class="status">
            <!-- Announcing every automatic change would talk over the visitor. -->
            <p data-test="slide-caption" :aria-live="playing ? 'off' : 'polite'">
              {{ slideIndex + 1 }} / {{ hero.slides.length }} · {{ slide.caption }}
            </p>
            <div class="dots">
              <button
                v-for="(s, i) in hero.slides"
                :key="i"
                type="button"
                class="dot-btn"
                data-test="dot"
                :aria-label="`Photo ${i + 1}: ${s.caption}`"
                :aria-current="i === slideIndex ? 'true' : undefined"
                @click="show(i)"
              />
            </div>
          </div>
          <button
            type="button"
            class="ctl ctl--dark"
            aria-label="Next photo"
            @click="show(slideIndex + 1)"
          >
            <IconChevronRight />
          </button>
          <button
            type="button"
            class="ctl ctl--plain"
            data-test="autoplay"
            :aria-label="paused ? 'Play the slideshow' : 'Pause the slideshow'"
            @click="paused = !paused"
          >
            <IconPlay v-if="paused" />
            <IconPause v-else />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background: var(--color-cream);
  scroll-margin-top: 5rem;
}
.inner {
  max-width: var(--landing-width);
  margin: 0 auto;
  padding: 4rem var(--gutter) 5rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.3rem 0.875rem 0.3rem 0.3rem;
  border-radius: var(--radius-pill);
  background: var(--color-white);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-gold) 55%, var(--color-charcoal));
}
.badge-mark {
  width: 1.375rem;
  height: 1.375rem;
}
h1 {
  margin: 1.25rem 0 1.25rem;
  font-size: clamp(2.75rem, 6vw, 4.25rem);
  font-weight: 500;
  line-height: 1.05;
}
h1 em {
  color: var(--color-crimson);
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: var(--color-gold);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.12em;
}
.body {
  max-width: 34rem;
  margin: 0 0 1.75rem;
  font-size: 1.0625rem;
  color: var(--color-text-muted);
}
.search {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 34rem;
  padding: 0.375rem;
  border-radius: var(--radius-pill);
  background: var(--color-white);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--color-charcoal) 10%, transparent);
}
.search-icon {
  flex: none;
  margin: 0 0.5rem 0 0.75rem;
  color: var(--color-text-muted);
}
.search input {
  flex: 1;
  min-width: 0;
  min-height: 2.75rem;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: 0.9375rem var(--font-body);
}
.search input:focus-visible {
  outline: none;
}
.search:focus-within {
  box-shadow: var(--focus-ring);
}
.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-top: 1.25rem;
}
.quick-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.quick ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  min-height: 2.25rem;
  padding: 0.375rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 500 0.8125rem var(--font-body);
  cursor: pointer;
}
.chip:hover {
  border-color: var(--color-crimson);
  color: var(--color-crimson);
}

/* The photo carousel with its floating cards. */
.art {
  position: relative;
  display: grid;
  justify-items: center;
  padding: 1rem 0 2rem;
}
.blob {
  position: absolute;
  inset: 4% 4% 10%;
  border-radius: 50% 50% 46% 54%;
  background: color-mix(in srgb, var(--color-gold) 30%, var(--color-cream));
}
.arch-trim {
  position: relative;
  width: min(100%, 20rem);
  padding: 8px;
  border-radius: 999px 999px 1.25rem 1.25rem;
  background: repeating-linear-gradient(
    135deg,
    var(--color-crimson) 0 5px,
    var(--color-gold) 5px 10px
  );
}
@media (min-width: 601px) {
  .arch-trim {
    width: min(100%, 23rem);
  }
}
@media (min-width: 1024px) {
  .arch-trim {
    /* As large as fits, but short enough that the controls stay on a laptop screen. */
    width: min(84%, 28rem, calc((100svh - 13rem) / 1.3));
  }
  .art {
    padding-bottom: 1rem;
  }
}
.arch {
  position: relative;
  aspect-ratio: 1 / 1.3;
  border-radius: 999px 999px 0.875rem 0.875rem;
  overflow: hidden;
}

/* Each photo fades in over the last while settling from a slight zoom, then drifts slowly. */
.slide {
  position: absolute;
  inset: 0;
}
.slide > * {
  animation: drift 7s ease-out both;
}
.slide-enter-active {
  transition:
    opacity 0.9s ease,
    transform 1.4s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-leave-active {
  transition: opacity 0.9s ease;
}
.slide-enter-from {
  opacity: 0;
  transform: scale(1.08);
}
.slide-leave-to {
  opacity: 0;
}
@keyframes drift {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.05);
  }
}
@media (prefers-reduced-motion: reduce) {
  .slide > * {
    animation: none;
  }
  .slide-enter-active,
  .slide-leave-active {
    transition: none;
  }
}
.card {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.875rem;
  background: var(--color-white);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-charcoal) 12%, transparent);
  font-size: 0.8125rem;
  line-height: 1.3;
}
.card strong {
  display: block;
  font-weight: 700;
}
.card small {
  display: block;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}
.card-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-crimson-soft);
  color: var(--color-crimson);
}
.card-icon--dark {
  background: var(--color-charcoal);
  color: var(--color-gold);
}
.card--branches {
  top: 2%;
  left: 0;
}
.card--delivery {
  top: 6%;
  right: -1rem;
  display: block;
  rotate: 4deg;
  background: var(--color-charcoal);
  color: var(--color-cream);
}
.card--delivery strong {
  font-family: var(--font-heading);
  font-size: 1.375rem;
}
.card--delivery small {
  color: var(--color-text-on-dark-muted);
}
.card--juices {
  top: 56%;
  left: 0;
  padding: 0.5rem 0.875rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-gold);
}
.card--hours {
  bottom: 18%;
  right: -1rem;
}
.controls {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: -1.25rem;
  padding: 0.375rem;
  border-radius: var(--radius-pill);
  background: var(--color-white);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-charcoal) 12%, transparent);
}
.ctl {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-white);
  color: var(--color-text);
  cursor: pointer;
}
.ctl--plain {
  width: 2rem;
  height: 2rem;
  border-color: transparent;
  color: var(--color-text-muted);
}
.ctl--dark {
  border-color: var(--color-charcoal);
  background: var(--color-charcoal);
  color: var(--color-cream);
}
.status {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  min-width: 10rem;
}
.status p {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.dots {
  display: flex;
  gap: 0.25rem;
}
.dot-btn {
  width: 1.25rem;
  height: 1rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  position: relative;
}
.dot-btn::after {
  content: '';
  position: absolute;
  inset: 50% auto auto 50%;
  translate: -50% -50%;
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-charcoal) 25%, transparent);
}
.dot-btn[aria-current='true']::after {
  width: 1rem;
  background: var(--color-crimson);
}

@media (max-width: 1023px) {
  .inner {
    grid-template-columns: 1fr;
    padding-block: 2.5rem 3.5rem;
    gap: 2rem;
  }
  .art {
    max-width: 36rem;
    width: 100%;
    margin: 0 auto;
  }
  .card--delivery,
  .card--hours {
    right: 0;
  }
}
@media (max-width: 600px) {
  .card {
    display: none;
  }
  .blob {
    inset: 0 0 8%;
  }
}
</style>
