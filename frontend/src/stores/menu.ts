import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Menu, MenuCategory, MenuCategoryId } from '@/api/types';

export const useMenuStore = defineStore('menu', () => {
  const categories = ref<MenuCategory[]>([]);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<ApiError | null>(null);
  /** The selected menu tab; shared so other sections (e.g. "See all drinks") can switch it. */
  const activeCategory = ref<MenuCategoryId>('calabar_classics');

  const allItems = computed(() => categories.value.flatMap((c) => c.items));
  const freshJuices = computed(() => allItems.value.filter((i) => i.isFreshJuice));

  async function load(): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      categories.value = (await api.get<Menu>('/menu')).categories;
      status.value = 'ready';
    } catch (err) {
      error.value = asApiError(err);
      status.value = 'error';
    }
  }

  function selectCategory(id: MenuCategoryId): void {
    activeCategory.value = id;
  }

  return {
    categories,
    status,
    error,
    activeCategory,
    allItems,
    freshJuices,
    load,
    selectCategory,
  };
});
