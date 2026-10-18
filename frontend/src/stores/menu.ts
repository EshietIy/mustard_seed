import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Menu, MenuCategory, MenuCategoryId, MenuItem } from '@/api/types';

/** The "All" pill: a filter in the UI, not a menu category (AGENT.md §1). */
export const ALL_CATEGORIES = 'all';

/** Lower case, accents and curly apostrophes folded, so "Pounded yàm" finds "Pounded Yam". */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

function searchText(item: MenuItem, category: MenuCategory): string {
  const juice = item.isFreshJuice ? 'fresh juice' : '';
  return normalise([item.name, item.description, category.label, juice].join(' '));
}

export const useMenuStore = defineStore('menu', () => {
  const categories = ref<MenuCategory[]>([]);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<ApiError | null>(null);
  /** The selected pill; shared so other sections (e.g. the hero search) can set it. */
  const activeCategory = ref<MenuCategoryId>(ALL_CATEGORIES);
  /** The current search, trimmed; '' means no search. */
  const query = ref('');

  const allItems = computed(() => categories.value.flatMap((c) => c.items));
  const houseSignatures = computed(() => allItems.value.filter((i) => i.isHouseSignature));

  /** Items for the selected pill that match every word of the search. */
  const visibleItems = computed(() => {
    const words = normalise(query.value).split(/\s+/).filter(Boolean);
    return categories.value
      .filter((c) => activeCategory.value === ALL_CATEGORIES || c.id === activeCategory.value)
      .flatMap((c) =>
        c.items.filter((item) => {
          const text = searchText(item, c);
          return words.every((word) => text.includes(word));
        }),
      );
  });

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
    activeCategory.value = categories.value.some((c) => c.id === id) ? id : ALL_CATEGORIES;
  }

  /** Searches the whole menu, so a selected pill never hides a match. */
  function search(text: string): void {
    query.value = text.trim();
    activeCategory.value = ALL_CATEGORIES;
  }

  return {
    categories,
    status,
    error,
    activeCategory,
    query,
    allItems,
    houseSignatures,
    visibleItems,
    load,
    selectCategory,
    search,
  };
});
