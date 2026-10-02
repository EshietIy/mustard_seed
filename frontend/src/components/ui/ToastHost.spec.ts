import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '@/stores/toast';
import ToastHost from './ToastHost.vue';

describe('ToastHost', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('announces messages politely and dismisses them on click', async () => {
    const toast = useToastStore();
    const wrapper = mount(ToastHost);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
    toast.show('Added Zobo to your order');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Added Zobo to your order');
    await wrapper.get('.toast').trigger('click');
    expect(toast.messages).toEqual([]);
  });
});
