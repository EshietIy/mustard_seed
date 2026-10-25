<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { AdminMenuItem, Menu } from '@/api/types';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useToastStore } from '@/stores/toast';
import { formatWatDate, priceLabel } from '@/utils/format';
import { MAX_DISH_KOBO, parseNairaInput } from '@/utils/naira-input';

/**
 * Dishes (AGENT.md slice 8), super admins only: add dishes, edit their details, move them up
 * or down within their category, and retire them. Retired dishes are kept for past orders and
 * can come back. New and returning dishes start switched off so staff can check them first.
 */
type Field = 'name' | 'description' | 'price';

interface Draft {
  name: string;
  description: string;
  category: string;
  isHouseSignature: boolean;
}

/** Match the API's limits. */
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;

const toast = useToastStore();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const categories = ref<Array<{ id: string; label: string }>>([]);
const dishes = ref<AdminMenuItem[]>([]);
const busy = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, ApiError | string>>({});
const confirmingRetire = ref<string | null>(null);

const draft = reactive<Draft & { price: string }>({
  name: '',
  description: '',
  category: '',
  isHouseSignature: false,
  price: '',
});
const addErrors = reactive<Partial<Record<Field, string>>>({});
const addError = ref<ApiError | null>(null);
const adding = ref(false);

const editing = ref<(Draft & { id: string }) | null>(null);
const editErrors = reactive<Partial<Record<Field, string>>>({});
const editError = ref<ApiError | null>(null);

function clear(fieldErrors: Partial<Record<Field, string>>): void {
  for (const key of Object.keys(fieldErrors) as Field[]) delete fieldErrors[key];
}

const byOrder = (a: AdminMenuItem, b: AdminMenuItem) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

const sections = computed(() =>
  categories.value
    .map((c) => ({
      ...c,
      dishes: dishes.value.filter((d) => d.category === c.id && !d.archivedAt).sort(byOrder),
    }))
    .filter((c) => c.dishes.length > 0),
);

const retired = computed(() =>
  dishes.value.filter((d) => d.archivedAt).sort((a, b) => a.name.localeCompare(b.name)),
);

const categoryLabel = (id: string) => categories.value.find((c) => c.id === id)?.label ?? id;

function replace(item: AdminMenuItem): void {
  dishes.value = dishes.value.map((d) => (d.id === item.id ? item : d));
}

/** Client checks that match the API's, so most mistakes never leave the page. */
function checkText(name: string, description: string): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string>> = {};
  if (!name) found.name = 'Enter the dish name.';
  else if (name.length > MAX_NAME) found.name = `Keep the name to ${MAX_NAME} characters.`;
  if (description.length > MAX_DESCRIPTION) {
    found.description = `Keep the description to ${MAX_DESCRIPTION} characters.`;
  }
  return found;
}

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  try {
    const [menu, items] = await Promise.all([
      api.get<Menu>('/menu'),
      api.get<AdminMenuItem[]>('/admin/menu-items'),
    ]);
    categories.value = menu.categories.map((c) => ({ id: c.id, label: c.label }));
    dishes.value = items;
    if (!draft.category) draft.category = categories.value[0]?.id ?? '';
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

async function addDish(): Promise<void> {
  const name = draft.name.trim();
  const description = draft.description.trim();
  clear(addErrors);
  addError.value = null;
  Object.assign(addErrors, checkText(name, description));
  let priceKobo: number | undefined;
  if (draft.price.trim()) {
    const parsed = parseNairaInput(draft.price, { maxKobo: MAX_DISH_KOBO, allowZero: false });
    if ('error' in parsed) addErrors.price = parsed.error;
    else priceKobo = parsed.kobo;
  }
  if (Object.keys(addErrors).length) return;

  adding.value = true;
  try {
    const created = await api.post<AdminMenuItem>('/admin/menu-items', {
      name,
      category: draft.category,
      description,
      isHouseSignature: draft.isHouseSignature,
      ...(priceKobo !== undefined && { priceKobo }),
    });
    dishes.value = [...dishes.value, created];
    Object.assign(draft, { name: '', description: '', isHouseSignature: false, price: '' });
    toast.show(
      `${created.name} added, switched off. Add a photo, then switch it on in Availability.`,
    );
  } catch (err) {
    const apiError = asApiError(err);
    const fields = apiError.fieldErrors ?? {};
    if (apiError.code === 'DISH_NAME_TAKEN') addErrors.name = apiError.message;
    else if (fields.name?.[0] || fields.description?.[0] || fields.priceKobo?.[0]) {
      if (fields.name?.[0]) addErrors.name = fields.name[0];
      if (fields.description?.[0]) addErrors.description = fields.description[0];
      if (fields.priceKobo?.[0]) addErrors.price = fields.priceKobo[0];
    } else addError.value = apiError;
  } finally {
    adding.value = false;
  }
}

async function move(dish: AdminMenuItem, direction: 'up' | 'down'): Promise<void> {
  delete errors[dish.id];
  busy[dish.id] = true;
  try {
    dishes.value = await api.post<AdminMenuItem[]>(`/admin/menu-items/${dish.id}/move`, {
      direction,
    });
  } catch (err) {
    errors[dish.id] = asApiError(err);
  } finally {
    busy[dish.id] = false;
  }
}

function startEdit(dish: AdminMenuItem): void {
  delete errors[dish.id];
  confirmingRetire.value = null;
  clear(editErrors);
  editError.value = null;
  editing.value = {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    category: dish.category,
    isHouseSignature: dish.isHouseSignature,
  };
}

async function saveEdit(dish: AdminMenuItem): Promise<void> {
  const form = editing.value;
  if (!form) return;
  const name = form.name.trim();
  const description = form.description.trim();
  clear(editErrors);
  editError.value = null;
  Object.assign(editErrors, checkText(name, description));
  if (Object.keys(editErrors).length) return;

  const changes: Record<string, unknown> = {};
  if (name !== dish.name) changes.name = name;
  if (description !== dish.description) changes.description = description;
  if (form.category !== dish.category) changes.category = form.category;
  if (form.isHouseSignature !== dish.isHouseSignature) {
    changes.isHouseSignature = form.isHouseSignature;
  }
  if (Object.keys(changes).length === 0) {
    editing.value = null;
    return;
  }

  busy[dish.id] = true;
  try {
    const saved = await api.patch<AdminMenuItem>(`/admin/menu-items/${dish.id}`, changes);
    replace(saved);
    editing.value = null;
    toast.show(`${saved.name} saved.`);
  } catch (err) {
    const apiError = asApiError(err);
    const fields = apiError.fieldErrors ?? {};
    if (apiError.code === 'DISH_NAME_TAKEN') editErrors.name = apiError.message;
    else if (fields.name?.[0]) editErrors.name = fields.name[0];
    else if (fields.description?.[0]) editErrors.description = fields.description[0];
    else editError.value = apiError;
  } finally {
    busy[dish.id] = false;
  }
}

async function setRetired(dish: AdminMenuItem, isArchived: boolean): Promise<void> {
  delete errors[dish.id];
  busy[dish.id] = true;
  try {
    const saved = await api.patch<AdminMenuItem>(`/admin/menu-items/${dish.id}`, { isArchived });
    replace(saved);
    confirmingRetire.value = null;
    toast.show(
      isArchived
        ? `${saved.name} retired.`
        : `${saved.name} is back on the menu, switched off. Switch it on in Availability when it’s ready.`,
    );
  } catch (err) {
    errors[dish.id] = asApiError(err);
  } finally {
    busy[dish.id] = false;
  }
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Dishes</h1>
    <p class="lead">
      Add and edit dishes, and set their order within each category. New dishes start switched off.
      Prices and photos have their own screens.
    </p>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the dishes…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the dishes."
      :error="loadError"
      @retry="load"
    />

    <template v-else>
      <form class="card add" data-test="add-dish" novalidate @submit.prevent="addDish">
        <h2>Add a dish</h2>
        <div class="grid">
          <label class="field wide">
            <span>Name</span>
            <input
              v-model="draft.name"
              data-test="add-name"
              autocomplete="off"
              :aria-invalid="addErrors.name ? 'true' : undefined"
              :aria-describedby="addErrors.name ? 'add-name-error' : undefined"
            />
            <span
              v-if="addErrors.name"
              id="add-name-error"
              class="error"
              data-test="add-name-error"
            >
              {{ addErrors.name }}
            </span>
          </label>
          <label class="field">
            <span>Category</span>
            <select v-model="draft.category">
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>Price in naira (optional)</span>
            <input
              v-model="draft.price"
              data-test="add-price"
              inputmode="decimal"
              autocomplete="off"
              placeholder="Leave empty for [PRICE]"
              :aria-invalid="addErrors.price ? 'true' : undefined"
              :aria-describedby="addErrors.price ? 'add-price-error' : undefined"
            />
            <span
              v-if="addErrors.price"
              id="add-price-error"
              class="error"
              data-test="add-price-error"
            >
              {{ addErrors.price }}
            </span>
          </label>
          <label class="field wide">
            <span>Description (optional)</span>
            <textarea
              v-model="draft.description"
              rows="2"
              :aria-invalid="addErrors.description ? 'true' : undefined"
              :aria-describedby="addErrors.description ? 'add-description-error' : undefined"
            />
            <span
              v-if="addErrors.description"
              id="add-description-error"
              class="error"
              data-test="add-description-error"
            >
              {{ addErrors.description }}
            </span>
          </label>
          <label class="check wide">
            <input v-model="draft.isHouseSignature" type="checkbox" />
            <span>House signature</span>
          </label>
        </div>
        <button type="submit" class="btn-primary btn-sm" :disabled="adding">Add dish</button>
        <div v-if="addError" data-test="add-error"><ActionError :error="addError" /></div>
      </form>

      <p v-if="!sections.length" class="state">No dishes yet. Add the first one above.</p>

      <section
        v-for="category in sections"
        :key="category.id"
        class="category"
        :data-category="category.id"
        :aria-labelledby="`cat-${category.id}`"
      >
        <h2 :id="`cat-${category.id}`">{{ category.label }}</h2>
        <ul class="rows">
          <li v-for="(dish, index) in category.dishes" :key="dish.id" data-test="dish">
            <form
              v-if="editing?.id === dish.id"
              class="edit"
              data-test="edit-form"
              novalidate
              @submit.prevent="saveEdit(dish)"
            >
              <span class="name sr-only">{{ dish.name }}</span>
              <label class="field">
                <span>Name</span>
                <input
                  v-model="editing.name"
                  data-test="edit-name"
                  autocomplete="off"
                  :aria-invalid="editErrors.name ? 'true' : undefined"
                  :aria-describedby="editErrors.name ? `edit-name-error-${dish.id}` : undefined"
                />
                <span
                  v-if="editErrors.name"
                  :id="`edit-name-error-${dish.id}`"
                  class="error"
                  data-test="edit-name-error"
                >
                  {{ editErrors.name }}
                </span>
              </label>
              <label class="field">
                <span>Description</span>
                <textarea
                  v-model="editing.description"
                  rows="2"
                  :aria-invalid="editErrors.description ? 'true' : undefined"
                  :aria-describedby="
                    editErrors.description ? `edit-description-error-${dish.id}` : undefined
                  "
                />
                <span
                  v-if="editErrors.description"
                  :id="`edit-description-error-${dish.id}`"
                  class="error"
                  data-test="edit-description-error"
                >
                  {{ editErrors.description }}
                </span>
              </label>
              <label class="field">
                <span>Category</span>
                <select v-model="editing.category">
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option>
                </select>
              </label>
              <label class="check">
                <input v-model="editing.isHouseSignature" type="checkbox" />
                <span>House signature</span>
              </label>
              <div class="actions">
                <button type="submit" class="btn-primary btn-sm" :disabled="busy[dish.id]">
                  Save
                </button>
                <button type="button" class="link" data-test="edit-cancel" @click="editing = null">
                  Cancel
                </button>
              </div>
              <ActionError v-if="editError" :error="editError" />
            </form>

            <template v-else>
              <div class="line">
                <div class="who">
                  <span class="name">{{ dish.name }}</span>
                  <span class="meta">
                    {{ priceLabel(dish.priceKobo) }}
                    <template v-if="dish.isHouseSignature"> · House signature</template>
                    <strong v-if="!dish.isAvailable" class="off"> · Switched off</strong>
                  </span>
                  <span v-if="dish.description" class="description">{{ dish.description }}</span>
                </div>
                <div class="actions">
                  <button
                    type="button"
                    class="arrow"
                    data-test="move-up"
                    :aria-label="`Move ${dish.name} up`"
                    :disabled="index === 0 || busy[dish.id]"
                    @click="move(dish, 'up')"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="arrow"
                    data-test="move-down"
                    :aria-label="`Move ${dish.name} down`"
                    :disabled="index === category.dishes.length - 1 || busy[dish.id]"
                    @click="move(dish, 'down')"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="link"
                    data-test="edit"
                    :disabled="busy[dish.id]"
                    @click="startEdit(dish)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="link"
                    data-test="retire"
                    :disabled="busy[dish.id]"
                    @click="confirmingRetire = dish.id"
                  >
                    Retire
                  </button>
                </div>
              </div>
              <div v-if="confirmingRetire === dish.id" class="confirm" data-test="retire-confirm">
                <p>
                  Retire {{ dish.name }}? It leaves the menu and can’t be ordered. Past orders still
                  show it, and you can bring it back later.
                </p>
                <div class="actions">
                  <button
                    type="button"
                    class="btn-primary btn-sm"
                    data-test="retire-yes"
                    :disabled="busy[dish.id]"
                    @click="setRetired(dish, true)"
                  >
                    Retire
                  </button>
                  <button
                    type="button"
                    class="link"
                    data-test="retire-no"
                    @click="confirmingRetire = null"
                  >
                    Keep it
                  </button>
                </div>
              </div>
              <ActionError v-if="errors[dish.id]" :error="errors[dish.id]!" />
            </template>
          </li>
        </ul>
      </section>

      <section v-if="retired.length" class="category" aria-labelledby="retired-heading">
        <h2 id="retired-heading">Retired dishes</h2>
        <ul class="rows">
          <li v-for="dish in retired" :key="dish.id" data-test="retired">
            <div class="line">
              <div class="who">
                <span class="name">{{ dish.name }}</span>
                <span class="meta">
                  {{ categoryLabel(dish.category) }} · Retired
                  {{ formatWatDate(dish.archivedAt!) }}
                </span>
              </div>
              <button
                type="button"
                class="btn-primary btn-sm"
                data-test="restore"
                :disabled="busy[dish.id]"
                @click="setRetired(dish, false)"
              >
                Bring back
              </button>
            </div>
            <ActionError v-if="errors[dish.id]" :error="errors[dish.id]!" />
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2rem;
}
.lead,
.state {
  margin: 0 0 1.5rem;
  color: var(--color-text-muted);
}
.card {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.add h2,
.category h2 {
  margin: 0 0 0.75rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.wide {
  grid-column: 1 / -1;
}
.field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
}
input:not([type='checkbox']),
select,
textarea {
  min-height: 2.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-weight: 400;
}
textarea {
  resize: vertical;
}
[aria-invalid='true'] {
  border-color: var(--color-crimson);
}
.error {
  color: var(--color-crimson);
  font-size: 0.875rem;
  font-weight: 600;
}
.category {
  margin-bottom: 1.5rem;
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.rows li {
  padding: 0.75rem 1rem;
}
.rows li + li {
  border-top: 1px solid var(--color-border);
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.who {
  display: grid;
  min-width: 0;
  flex: 1 1 12rem;
}
.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.meta,
.description {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.off {
  color: var(--color-charcoal);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.arrow {
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-white);
  color: var(--color-charcoal);
  font: 600 1rem var(--font-body);
  cursor: pointer;
}
.arrow:disabled {
  opacity: 0.4;
  cursor: default;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-crimson);
  font: 600 0.875rem var(--font-body);
  text-decoration: underline;
  cursor: pointer;
}
.edit {
  display: grid;
  gap: 0.75rem;
}
.confirm {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: var(--color-surface-soft);
}
.confirm p {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
}
</style>
