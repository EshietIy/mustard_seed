import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { routes } from '@/router';
import { useAuthStore, type Role } from '@/stores/auth';
import { routeFetch } from '@/test-utils/fetch';

enableAutoUnmount(afterEach);

// The layout renders its child screen through RouterView, so mount it the way the app does.
const Host = defineComponent({ render: () => h(RouterView) });

function signIn(role: Role): void {
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
}

async function mountAdmin(path = '/admin') {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  const wrapper = mount(Host, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('AdminLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.unstubAllGlobals();
  });

  it('shows a loading state while the session is still being checked', async () => {
    const { wrapper } = await mountAdmin();
    expect(wrapper.get('[data-test="admin-loading"]').text()).toContain('Checking your account');
    expect(wrapper.find('[data-test="admin-nav"]').exists()).toBe(false);
  });

  it('asks a signed-out visitor to sign in, and opens the sign-in dialog', async () => {
    useAuthStore().status = 'signed-out';
    const { wrapper } = await mountAdmin();
    const panel = wrapper.get('[data-test="admin-signed-out"]');
    expect(panel.text()).toContain('Staff sign-in');
    expect(wrapper.find('[data-test="admin-nav"]').exists()).toBe(false);
    await panel.get('button').trigger('click');
    expect(useAuthStore().signInOpen).toBe(true);
  });

  it('refuses a customer and shows no staff screens', async () => {
    signIn('customer');
    const { wrapper } = await mountAdmin();
    const panel = wrapper.get('[data-test="admin-forbidden"]');
    expect(panel.text()).toContain('This area is for Mustard Seed staff');
    expect(panel.get('a').attributes('href')).toBe('/');
    expect(wrapper.find('[data-test="admin-nav"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Availability');
  });

  it('shows a supervisor only the screens their role can use', async () => {
    signIn('supervisor');
    const { wrapper } = await mountAdmin();
    const links = wrapper.get('[data-test="admin-nav"]').findAll('a');
    expect(links.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Overview', '/admin'],
      ['Availability', '/admin/availability'],
      ['Meats & prices', '/admin/meats'],
    ]);
    expect(wrapper.text()).toContain('Kitchen supervisor');
    expect(wrapper.text()).toContain('Ekaette');
  });

  it('shows a super_admin every screen', async () => {
    signIn('super_admin');
    const { wrapper } = await mountAdmin();
    const labels = wrapper
      .get('[data-test="admin-nav"]')
      .findAll('a')
      .map((a) => a.text());
    expect(labels).toEqual(['Overview', 'Availability', 'Meats & prices', 'Item prices', 'Photos']);
    expect(wrapper.text()).toContain('Super admin');
  });

  it('stops a supervisor who opens a super_admin screen by its address', async () => {
    signIn('supervisor');
    const { wrapper } = await mountAdmin('/admin/prices');
    expect(wrapper.get('[data-test="admin-role-refused"]').text()).toContain(
      'Your role can’t use this screen',
    );
    expect(wrapper.find('[data-test="admin-pending"]').exists()).toBe(false);
    // The rest of the staff area stays usable.
    expect(wrapper.find('[data-test="admin-nav"]').exists()).toBe(true);
  });

  it('lets a super_admin open the same screen', async () => {
    signIn('super_admin');
    const { wrapper } = await mountAdmin('/admin/prices');
    expect(wrapper.find('[data-test="admin-role-refused"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-pending"]').exists()).toBe(true);
  });

  it('signs out and returns to the menu', async () => {
    signIn('supervisor');
    routeFetch({ 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    const { wrapper, router } = await mountAdmin();
    await wrapper.get('[data-test="admin-sign-out"]').trigger('click');
    await flushPromises();
    expect(useAuthStore().status).toBe('signed-out');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('turns into the sign-in prompt when the session ends mid-visit', async () => {
    signIn('supervisor');
    const { wrapper } = await mountAdmin();
    useAuthStore().handleUnauthorized('/admin/option-groups');
    await flushPromises();
    expect(wrapper.find('[data-test="admin-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-signed-out"]').exists()).toBe(true);
  });
});
