import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './toast';

describe('toast store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shows a message and hides it after a while', () => {
    const toast = useToastStore();
    toast.show('Added Zobo to your order');
    expect(toast.messages.map((m) => m.text)).toEqual(['Added Zobo to your order']);
    vi.advanceTimersByTime(4000);
    expect(toast.messages).toEqual([]);
  });

  it('keeps only the latest few messages', () => {
    const toast = useToastStore();
    for (let i = 0; i < 5; i++) toast.show(`m${i}`);
    expect(toast.messages.map((m) => m.text)).toEqual(['m2', 'm3', 'm4']);
  });

  it('can dismiss a message', () => {
    const toast = useToastStore();
    toast.show('hello');
    toast.dismiss(toast.messages[0]!.id);
    expect(toast.messages).toEqual([]);
  });
});
