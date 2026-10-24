<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { ImageUploadResult, Menu, MenuImage, StorageUsage } from '@/api/types';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import PhotoPlaceholder from '@/components/ui/PhotoPlaceholder.vue';
import { useToastStore } from '@/stores/toast';

/**
 * Dish photos (AGENT.md 3.1, slice 8), super admins only. The backend checks, resizes and
 * stores each photo; a failed upload keeps the photo the dish already had.
 */
interface Row {
  id: string;
  name: string;
  image: MenuImage | null;
  /** The photo would not load: show the placeholder instead of a broken image. */
  broken: boolean;
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
/** The backend allows at most 20 MB (its own limit may be lower; it then answers 413). */
const MAX_BYTES = 20 * 1024 * 1024;
const MB = 1024 * 1024;

const toast = useToastStore();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const categories = ref<Array<{ id: string; label: string; rows: Row[] }>>([]);
const storage = ref<StorageUsage | null>(null);
const storageFailed = ref(false);
const busy = reactive<Record<string, 'uploading' | 'removing' | undefined>>({});
const errors = reactive<Record<string, ApiError | string>>({});
const confirmingRemove = ref<string | null>(null);

/** 12.3 MB, 21 MB, 1 GB. */
function size(bytes: number): string {
  const [value, unit] = bytes >= 1024 * MB ? [bytes / (1024 * MB), 'GB'] : [bytes / MB, 'MB'];
  return `${value.toFixed(1).replace(/\.0$/, '')} ${unit}`;
}

async function loadUsage(): Promise<void> {
  try {
    storage.value = await api.get<StorageUsage>('/admin/storage-usage');
    storageFailed.value = false;
  } catch {
    storageFailed.value = true;
  }
}

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  void loadUsage();
  try {
    const menu = await api.get<Menu>('/menu');
    categories.value = menu.categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        id: c.id,
        label: c.label,
        rows: c.items.map((i) => ({ id: i.id, name: i.name, image: i.image, broken: false })),
      }));
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

async function upload(row: Row, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Let the same file be chosen again after a failure.
  input.value = '';
  if (!file) return;
  delete errors[row.id];
  if (!ACCEPT.includes(file.type)) {
    errors[row.id] = 'Photos must be JPEG, PNG or WebP.';
    return;
  }
  if (file.size > MAX_BYTES) {
    errors[row.id] = `That photo is ${size(file.size)}. Choose one under ${size(MAX_BYTES)}.`;
    return;
  }
  const form = new FormData();
  form.append('image', file);
  busy[row.id] = 'uploading';
  try {
    const result = await api.post<ImageUploadResult>(`/admin/menu-items/${row.id}/image`, form);
    row.image = result.image;
    row.broken = false;
    if (result.storage) storage.value = result.storage;
    toast.show(`Photo of ${row.name} saved.`);
  } catch (err) {
    errors[row.id] = asApiError(err);
  } finally {
    busy[row.id] = undefined;
  }
}

async function remove(row: Row): Promise<void> {
  delete errors[row.id];
  busy[row.id] = 'removing';
  try {
    await api.delete<void>(`/admin/menu-items/${row.id}/image`);
    row.image = null;
    confirmingRemove.value = null;
    toast.show(`Photo of ${row.name} removed.`);
    void loadUsage();
  } catch (err) {
    errors[row.id] = asApiError(err);
  } finally {
    busy[row.id] = undefined;
  }
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Dish photos</h1>
    <p class="lead">
      JPEG, PNG or WebP. Each photo is resized and saved as a small file, so menus load quickly.
      Dishes without a photo show “Photo coming”.
    </p>

    <div class="storage" data-test="storage">
      <template v-if="storage">
        <p>
          Photo storage: {{ size(storage.usedBytes) }} of {{ size(storage.allowanceBytes) }} used
          ({{ storage.percent }}%)
        </p>
        <div
          class="meter"
          role="progressbar"
          aria-label="Photo storage used"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="storage.percent"
        >
          <span :style="{ width: `${Math.min(storage.percent, 100)}%` }" />
        </div>
        <p v-if="storage.nearLimit" role="alert" class="warning">
          Photo storage is {{ storage.percent }}% full. Tell the owner: the Supabase plan may need
          upgrading before it runs out.
        </p>
      </template>
      <p v-else-if="storageFailed" class="muted">We couldn’t read how much storage is used.</p>
    </div>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the menu…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the menu."
      :error="loadError"
      @retry="load"
    />

    <p v-else-if="!categories.length" class="state">No dishes on the menu yet.</p>

    <section
      v-for="category in categories"
      v-else
      :key="category.id"
      class="category"
      :aria-labelledby="`cat-${category.id}`"
    >
      <h2 :id="`cat-${category.id}`">{{ category.label }}</h2>
      <ul class="rows">
        <li v-for="row in category.rows" :key="row.id" data-test="dish">
          <div class="line">
            <div class="thumb">
              <img
                v-if="row.image && !row.broken"
                :src="row.image.thumbnailUrl"
                :alt="row.name"
                width="96"
                height="64"
                loading="lazy"
                decoding="async"
                @error="row.broken = true"
              />
              <PhotoPlaceholder v-else />
            </div>
            <span class="name">{{ row.name }}</span>
            <div class="actions">
              <span v-if="busy[row.id] === 'uploading'" class="muted" aria-live="polite">
                Uploading…
              </span>
              <label class="btn-primary btn-sm upload" :class="{ disabled: busy[row.id] }">
                {{ row.image ? 'Replace photo' : 'Upload photo' }}
                <input
                  type="file"
                  class="sr-only"
                  :accept="ACCEPT.join(',')"
                  :aria-label="`Upload a photo of ${row.name}`"
                  :disabled="!!busy[row.id]"
                  @change="upload(row, $event)"
                />
              </label>
              <button
                v-if="row.image"
                type="button"
                class="link"
                data-test="remove-photo"
                :disabled="!!busy[row.id]"
                @click="confirmingRemove = row.id"
              >
                Remove photo
              </button>
            </div>
          </div>
          <div v-if="confirmingRemove === row.id" class="confirm" data-test="remove-confirm">
            <p>
              <strong>Remove the photo of {{ row.name }}?</strong> Customers will see “Photo coming”
              until a new one is uploaded.
            </p>
            <div class="actions">
              <button
                type="button"
                class="btn-primary btn-sm"
                data-test="remove-yes"
                :disabled="!!busy[row.id]"
                @click="remove(row)"
              >
                Remove photo
              </button>
              <button
                type="button"
                class="link"
                data-test="remove-no"
                @click="confirmingRemove = null"
              >
                Keep it
              </button>
            </div>
          </div>
          <ActionError v-if="errors[row.id]" :error="errors[row.id]!" />
        </li>
      </ul>
    </section>
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
.muted {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
.storage {
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}
.storage p {
  margin: 0 0 0.5rem;
}
.meter {
  height: 0.5rem;
  max-width: 24rem;
  border-radius: 999px;
  background: var(--color-surface-soft);
  overflow: hidden;
}
.meter span {
  display: block;
  height: 100%;
  background: var(--color-charcoal);
}
.warning {
  margin-top: 0.5rem;
  color: var(--color-crimson);
  font-weight: 600;
}
.category {
  margin-bottom: 1.5rem;
}
.category h2 {
  margin: 0 0 0.5rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
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
  gap: 0.75rem 1rem;
}
.thumb {
  flex: none;
  width: 6rem;
  height: 4rem;
  border-radius: 0.5rem;
  overflow: hidden;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.name {
  flex: 1 1 8rem;
  font-weight: 600;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.upload {
  cursor: pointer;
}
.upload:focus-within {
  outline: 2px solid var(--color-charcoal);
  outline-offset: 2px;
}
.upload.disabled {
  opacity: 0.6;
  cursor: progress;
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
