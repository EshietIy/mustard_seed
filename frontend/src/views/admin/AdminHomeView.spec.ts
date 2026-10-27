import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { routes } from '@/router';
import { useAuthStore, type Role } from '@/stores/auth';
import AdminHomeView from './AdminHomeView.vue';

enableAutoUnmount(afterEach);

async function mountHome(role: Role) {
  const auth = useAuthStore();
  auth.status = 'signed-in';
  auth.user = {
    id: 'u-1',
    email: 'staff@example.com',
    firstName: 'Ekaette',
    fullName: 'Ekaette Bassey',
    avatarUrl: null,
    role,
  };
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/admin');
  const wrapper = mount(AdminHomeView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('AdminHomeView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('greets the staff member and lists what their role can do', async () => {
    const wrapper = await mountHome('supervisor');
    expect(wrapper.get('h1').text()).toContain('Ekaette');
    const cards = wrapper.findAll('[data-test="admin-section"]');
    expect(cards.map((c) => c.get('h2').text())).toEqual(['Availability', 'Meats & prices']);
    expect(cards[0]!.get('a').attributes('href')).toBe('/admin/availability');
    expect(cards[1]!.text()).toContain('per soup');
  });

  it('lists every section for a super_admin', async () => {
    const wrapper = await mountHome('super_admin');
    expect(wrapper.findAll('[data-test="admin-section"]')).toHaveLength(8);
  });
});
