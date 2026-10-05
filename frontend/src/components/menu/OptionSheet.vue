<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { MenuItem, MenuOptionGroup } from '@/api/types';
import IconClose from '@/components/icons/IconClose.vue';
import { formatNaira } from '@/utils/format';

/**
 * Choices for one item (AGENT.md section 14). Renders whatever groups the API returns, so new
 * options appear without a release. Nothing is preselected; Add waits for required choices.
 */
const props = defineProps<{ item: MenuItem }>();
const emit = defineEmits<{ add: [optionIds: string[]]; close: [] }>();

const chosen = ref<Record<string, string[]>>(
  Object.fromEntries(props.item.optionGroups.map((g) => [g.id, []])),
);
const sheet = ref<HTMLElement | null>(null);
const titleId = `option-sheet-${props.item.id}`;

const isSingle = (group: MenuOptionGroup) => group.maxChoices === 1;
const picked = (group: MenuOptionGroup) => chosen.value[group.id] ?? [];

function rule(group: MenuOptionGroup): string {
  const required = group.minChoices > 0 ? 'Required' : 'Optional';
  if (isSingle(group)) return `${required} · choose 1`;
  if (group.minChoices > 0)
    return `${required} · choose ${group.minChoices} to ${group.maxChoices}`;
  return `${required} · up to ${group.maxChoices}`;
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** The first group still missing a required choice, as a sentence; null when ready. */
const missing = computed(() => {
  const group = props.item.optionGroups.find((g) => picked(g).length < g.minChoices);
  if (!group) return null;
  const what = group.name.toLowerCase();
  return group.minChoices === 1
    ? `Choose ${article(what)} ${what} to add this.`
    : `Choose at least ${group.minChoices} ${what} to add this.`;
});

const selectedIds = computed(() =>
  props.item.optionGroups.flatMap((g) =>
    g.options.filter((o) => picked(g).includes(o.id)).map((o) => o.id),
  ),
);

const price = computed(() => {
  if (props.item.priceKobo === null) return null;
  const extra = props.item.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => selectedIds.value.includes(o.id))
    .reduce((sum, o) => sum + o.priceDeltaKobo, 0);
  return props.item.priceKobo + extra;
});

function toggle(group: MenuOptionGroup, optionId: string, on: boolean): void {
  if (isSingle(group)) {
    chosen.value[group.id] = on ? [optionId] : [];
    return;
  }
  const current = picked(group).filter((id) => id !== optionId);
  chosen.value[group.id] = on ? [...current, optionId] : current;
}

function isDisabled(group: MenuOptionGroup, optionId: string, isAvailable: boolean): boolean {
  if (!isAvailable) return true;
  // Several-choice groups stop at their maximum; un-ticking stays possible.
  return (
    !isSingle(group) &&
    picked(group).length >= group.maxChoices &&
    !picked(group).includes(optionId)
  );
}

function add(): void {
  if (missing.value) return;
  emit('add', selectedIds.value);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

let opener: HTMLElement | null = null;
onMounted(async () => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  sheet.value?.querySelector<HTMLElement>('input:not([disabled]), button')?.focus();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  opener?.focus();
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section ref="sheet" class="sheet" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <header class="head">
        <h2 :id="titleId">{{ item.name }}</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')">
          <IconClose />
        </button>
      </header>

      <div class="groups">
        <fieldset v-for="group in item.optionGroups" :key="group.id" class="group">
          <legend>
            <span class="group-name">{{ group.name }}</span>
            <span class="rule">{{ rule(group) }}</span>
          </legend>
          <div v-for="option in group.options" :key="option.id" class="option">
            <input
              :id="`opt-${option.id}`"
              :type="isSingle(group) ? 'radio' : 'checkbox'"
              :name="`group-${group.id}`"
              :value="option.id"
              :checked="picked(group).includes(option.id)"
              :disabled="isDisabled(group, option.id, option.isAvailable)"
              @change="toggle(group, option.id, ($event.target as HTMLInputElement).checked)"
            />
            <label :for="`opt-${option.id}`">
              <span>{{ option.name }}</span>
              <span v-if="!option.isAvailable" class="muted">Not available</span>
              <span v-else-if="option.priceDeltaKobo > 0" class="extra">
                +{{ formatNaira(option.priceDeltaKobo) }}
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      <footer class="foot">
        <p v-if="missing" class="needed" data-test="choice-needed" aria-live="polite">
          {{ missing }}
        </p>
        <button
          type="button"
          class="btn-primary add"
          data-test="add-with-options"
          :disabled="!!missing"
          @click="add"
        >
          {{ price === null ? 'Add to order' : `Add to order · ${formatNaira(price)}` }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 160;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: color-mix(in srgb, var(--color-charcoal) 55%, transparent);
}
.sheet {
  width: min(32rem, 100vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-cream);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: 0 -12px 32px color-mix(in srgb, var(--color-charcoal) 25%, transparent);
}
@media (min-width: 640px) {
  .overlay {
    align-items: center;
  }
  .sheet {
    border-radius: var(--radius-card);
  }
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.25rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
h2 {
  margin: 0;
  font-size: 1.75rem;
}
.icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-white);
  color: var(--color-text);
}
.groups {
  overflow-y: auto;
  padding: 0.5rem 1.25rem;
}
.group {
  margin: 0.75rem 0;
  padding: 0;
  border: 0;
}
legend {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}
.group-name {
  font-weight: 700;
}
.rule {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.option input {
  width: 1.125rem;
  height: 1.125rem;
  accent-color: var(--color-crimson);
}
.option label {
  display: flex;
  flex: 1;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
}
.option input:disabled + label {
  cursor: not-allowed;
  opacity: 0.6;
}
.extra {
  font-weight: 700;
}
.muted {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
.foot {
  padding: 1rem 1.25rem 1.25rem;
  border-top: 1px solid var(--color-border);
}
.needed {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--color-crimson);
  background: var(--color-crimson-soft);
  font-size: 0.875rem;
}
.add {
  width: 100%;
}
.add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
