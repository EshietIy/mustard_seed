import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: number;
  text: string;
}

const VISIBLE_MS = 3500;
const MAX_VISIBLE = 3;

/** Short confirmations ("Added Zobo to your order"), announced politely to screen readers. */
export const useToastStore = defineStore('toast', () => {
  const messages = ref<Toast[]>([]);
  let nextId = 1;

  function dismiss(id: number): void {
    messages.value = messages.value.filter((m) => m.id !== id);
  }

  function show(text: string): void {
    const id = nextId++;
    messages.value = [...messages.value, { id, text }].slice(-MAX_VISIBLE);
    setTimeout(() => dismiss(id), VISIBLE_MS);
  }

  return { messages, show, dismiss };
});
