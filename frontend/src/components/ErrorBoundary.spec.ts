import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { ApiError } from '@/api/client';
import ErrorBoundary from './ErrorBoundary.vue';

const shouldThrow = ref(true);
const Crashy = defineComponent({
  props: { error: { type: Error, default: () => new Error('render exploded') } },
  setup(props) {
    return () => {
      if (shouldThrow.value) throw props.error;
      return h('p', 'All good');
    };
  },
});

describe('ErrorBoundary', () => {
  it('renders the slot when nothing fails', () => {
    shouldThrow.value = false;
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Crashy) } });
    expect(wrapper.text()).toContain('All good');
  });

  it('shows a recovery screen instead of a blank page when a child crashes', async () => {
    shouldThrow.value = true;
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Crashy) } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Something went wrong');
    expect(wrapper.text()).not.toContain('render exploded');
  });

  it('shows the reference ID for API errors', async () => {
    shouldThrow.value = true;
    const error = new ApiError({ kind: 'server', message: 'x', requestId: 'abc-123' });
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Crashy, { error }) } });
    await flushPromises();
    expect(wrapper.text()).toContain('Reference: abc-123');
  });

  it('recovers when the user retries', async () => {
    shouldThrow.value = true;
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Crashy) } });
    await flushPromises();
    shouldThrow.value = false;
    await wrapper.get('button').trigger('click');
    expect(wrapper.text()).toContain('All good');
  });
});
