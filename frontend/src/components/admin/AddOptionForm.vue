<script setup lang="ts">
import { reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminOptionGroup } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { parseNairaInput } from '@/utils/naira-input';
import ActionError from './ActionError.vue';

/**
 * Adds a meat (or other option) to a group, offered on the dishes ticked in the checklist, all
 * ticked by default (AGENT.md section 14). Supervisors and super admins may do this.
 */
const props = defineProps<{ group: AdminOptionGroup; dishNames: Record<string, string> }>();
const emit = defineEmits<{ added: [group: AdminOptionGroup] }>();

const toast = useToastStore();
const name = ref('');
const price = ref('');
const ticked = ref<string[]>([...props.group.itemIds]);
const errors = reactive<{ name?: string; price?: string; dishes?: string }>({});
const formError = ref<ApiError | null>(null);
const saving = ref(false);

function firstField(err: ApiError, field: string): string | undefined {
  return err.fieldErrors?.[field]?.[0];
}

async function submit(): Promise<void> {
  const parsed = parseNairaInput(price.value);
  errors.name = name.value.trim() ? undefined : 'Enter a name.';
  errors.price = 'error' in parsed ? parsed.error : undefined;
  errors.dishes = ticked.value.length ? undefined : 'Tick at least one dish.';
  formError.value = null;
  if (errors.name || errors.price || errors.dishes || 'error' in parsed) return;

  saving.value = true;
  try {
    const group = await api.post<AdminOptionGroup>(
      `/admin/option-groups/${props.group.id}/options`,
      { name: name.value.trim(), priceDeltaKobo: parsed.kobo, itemIds: ticked.value },
    );
    toast.show(`${name.value.trim()} added.`);
    name.value = '';
    price.value = '';
    ticked.value = [...group.itemIds];
    emit('added', group);
  } catch (err) {
    const apiError = asApiError(err);
    if (apiError.code === 'OPTION_NAME_TAKEN') {
      errors.name = apiError.message;
    } else if (apiError.fieldErrors) {
      errors.name = firstField(apiError, 'name');
      errors.price = firstField(apiError, 'priceDeltaKobo');
      errors.dishes = firstField(apiError, 'itemIds');
      if (!errors.name && !errors.price && !errors.dishes) formError.value = apiError;
    } else {
      formError.value = apiError;
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="add" data-test="add-meat" novalidate @submit.prevent="submit">
    <h3>Add to {{ group.name }}</h3>
    <div class="row">
      <div>
        <label :for="`new-name-${group.id}`">Name</label>
        <input
          :id="`new-name-${group.id}`"
          v-model="name"
          data-test="new-name"
          maxlength="60"
          autocomplete="off"
          placeholder="e.g. Goat meat"
          :aria-invalid="errors.name ? 'true' : undefined"
        />
        <p v-if="errors.name" class="field-error" role="alert" data-test="new-name-error">
          {{ errors.name }}
        </p>
      </div>
      <div>
        <label :for="`new-price-${group.id}`">Extra cost (₦)</label>
        <input
          :id="`new-price-${group.id}`"
          v-model="price"
          data-test="new-price"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0"
          :aria-invalid="errors.price ? 'true' : undefined"
        />
        <p v-if="errors.price" class="field-error" role="alert" data-test="new-price-error">
          {{ errors.price }}
        </p>
      </div>
    </div>

    <fieldset>
      <legend>Offer it on</legend>
      <label v-for="id in group.itemIds" :key="id" class="check">
        <input v-model="ticked" type="checkbox" :value="id" />
        {{ dishNames[id] ?? 'Unknown dish' }}
      </label>
      <p v-if="errors.dishes" class="field-error" role="alert" data-test="new-dishes-error">
        {{ errors.dishes }}
      </p>
    </fieldset>

    <div v-if="formError" data-test="add-error">
      <ActionError :error="formError" />
    </div>
    <button type="submit" class="btn-primary btn-sm" :disabled="saving">Add</button>
  </form>
</template>

<style scoped>
.add {
  padding: 1rem 1.25rem;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
}
h3 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
}
input:not([type='checkbox']) {
  width: 12rem;
  max-width: 100%;
  min-height: 2.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
}
input[aria-invalid='true'] {
  border-color: var(--color-crimson);
}
fieldset {
  margin: 1rem 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
}
.check input {
  accent-color: var(--color-crimson);
}
.field-error {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: var(--color-crimson);
}
</style>
