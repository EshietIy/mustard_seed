import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StaffMember } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import AdminStaffView from './AdminStaffView.vue';

enableAutoUnmount(afterEach);

const member = (overrides: Partial<StaffMember>): StaffMember => ({
  id: 's-x',
  email: 'x@example.com',
  role: 'supervisor',
  isActive: true,
  createdAt: '2026-10-20T09:00:00Z',
  deactivatedAt: null,
  ...overrides,
});

const OWNER = member({ id: 's-owner', email: 'owner@example.com', role: 'super_admin' });
const CHEF = member({ id: 's-chef', email: 'chef@example.com' });
const FORMER = member({
  id: 's-former',
  email: 'former@example.com',
  isActive: false,
  deactivatedAt: '2026-10-22T12:00:00Z',
});

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string, extra: object = {}) =>
  json({ error: { code, message, requestId: 'ref-5', ...extra } }, status);

function signInAsOwner(): void {
  const auth = useAuthStore();
  auth.status = 'signed-in';
  auth.user = {
    id: 'u-owner',
    email: 'Owner@Example.com',
    firstName: 'Nse',
    fullName: 'Nse Etim',
    avatarUrl: null,
    role: 'super_admin',
  };
}

async function mountView() {
  const wrapper = mount(AdminStaffView);
  await flushPromises();
  return wrapper;
}

function person(wrapper: VueWrapper, email: string) {
  const row = wrapper.findAll('[data-test="staff"]').find((r) => r.text().includes(email));
  if (!row) throw new Error(`no row for ${email}`);
  return row;
}

async function add(wrapper: VueWrapper, email: string, role = 'supervisor') {
  const form = wrapper.get('[data-test="add-staff"]');
  await form.get('input[type="email"]').setValue(email);
  await form.get('select').setValue(role);
  await form.trigger('submit');
  await flushPromises();
}

describe('AdminStaffView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    signInAsOwner();
  });

  it('shows a loading state first', () => {
    routeFetch({ 'GET /admin/staff': () => json([OWNER]) });
    expect(mount(AdminStaffView).get('[aria-busy="true"]').text()).toContain('Loading');
  });

  it('lists active staff first, with their role and dates', async () => {
    routeFetch({ 'GET /admin/staff': () => json([FORMER, OWNER, CHEF]) });
    const wrapper = await mountView();
    expect(wrapper.findAll('[data-test="staff"] .email').map((e) => e.text())).toEqual([
      'chef@example.com',
      'owner@example.com',
      'former@example.com',
    ]);
    expect(person(wrapper, 'chef@').text()).toContain('Kitchen supervisor');
    expect(person(wrapper, 'chef@').text()).toContain('Added 20 Oct 2026');
    expect(person(wrapper, 'owner@').text()).toContain('Super admin');
    expect(person(wrapper, 'former@').text()).toContain('No staff access since 22 Oct 2026');
  });

  it('marks your own account and offers no actions on it', async () => {
    routeFetch({ 'GET /admin/staff': () => json([OWNER, CHEF]) });
    const wrapper = await mountView();
    const own = person(wrapper, 'owner@');
    expect(own.text()).toContain('You');
    expect(own.findAll('button')).toHaveLength(0);
    expect(person(wrapper, 'chef@').findAll('button').length).toBeGreaterThan(0);
  });

  it('adds a supervisor and explains how they get in', async () => {
    const created = member({ id: 's-new', email: 'ime@example.com' });
    const fetchMock = routeFetch({
      'GET /admin/staff': () => json([OWNER]),
      'POST /admin/staff': () => json(created, 201),
    });
    const wrapper = await mountView();
    await add(wrapper, '  ime@example.com ');
    expect(bodyOf(fetchMock, 'POST /admin/staff')).toEqual({
      email: 'ime@example.com',
      role: 'supervisor',
    });
    expect(person(wrapper, 'ime@').text()).toContain('Kitchen supervisor');
    expect(useToastStore().messages.at(-1)?.text).toBe(
      'ime@example.com added as Kitchen supervisor. They sign in with that Google account.',
    );
    expect((wrapper.get('[data-test="add-staff"] input').element as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('adds a super admin', async () => {
    const fetchMock = routeFetch({
      'GET /admin/staff': () => json([OWNER]),
      'POST /admin/staff': () =>
        json(member({ id: 's-2', email: 'co@example.com', role: 'super_admin' }), 201),
    });
    const wrapper = await mountView();
    await add(wrapper, 'co@example.com', 'super_admin');
    expect(bodyOf(fetchMock, 'POST /admin/staff')).toEqual({
      email: 'co@example.com',
      role: 'super_admin',
    });
  });

  it.each([
    ['', 'Enter their Google email address.'],
    ['ime', 'Enter a full email address, for example chef@gmail.com.'],
  ])('refuses %j without calling the API', async (email, message) => {
    const fetchMock = routeFetch({ 'GET /admin/staff': () => json([OWNER]) });
    const wrapper = await mountView();
    await add(wrapper, email);
    const form = wrapper.get('[data-test="add-staff"]');
    expect(form.get('[data-test="email-error"]').text()).toBe(message);
    expect(form.get('input').attributes('aria-invalid')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows an email already on the list next to the email box', async () => {
    routeFetch({
      'GET /admin/staff': () => json([OWNER, CHEF]),
      'POST /admin/staff': () =>
        failure(409, 'STAFF_EXISTS', 'That email is already on the staff list.'),
    });
    const wrapper = await mountView();
    await add(wrapper, 'chef@example.com');
    expect(wrapper.get('[data-test="email-error"]').text()).toBe(
      'That email is already on the staff list.',
    );
  });

  it('shows a server email check next to the email box', async () => {
    routeFetch({
      'GET /admin/staff': () => json([OWNER]),
      'POST /admin/staff': () =>
        failure(400, 'VALIDATION_FAILED', 'Some fields are invalid.', {
          details: [{ field: 'email', messages: ['email must be an email'] }],
        }),
    });
    const wrapper = await mountView();
    await add(wrapper, 'odd@example.c');
    expect(wrapper.get('[data-test="email-error"]').text()).toBe('email must be an email');
  });

  it('explains any other failure to add, with its reference', async () => {
    routeFetch({
      'GET /admin/staff': () => json([OWNER]),
      'POST /admin/staff': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
    });
    const wrapper = await mountView();
    await add(wrapper, 'ime@example.com');
    expect(wrapper.get('[data-test="add-error"]').text()).toContain('Reference: ref-5');
    expect(wrapper.findAll('[data-test="staff"]')).toHaveLength(1);
  });

  it('makes a supervisor a super admin after warning what that allows', async () => {
    const fetchMock = routeFetch({
      'GET /admin/staff': () => json([OWNER, CHEF]),
      'PATCH /admin/staff/s-chef': () => json({ ...CHEF, role: 'super_admin' }),
    });
    const wrapper = await mountView();
    await person(wrapper, 'chef@').get('[data-test="change-role"]').trigger('click');
    const confirm = person(wrapper, 'chef@').get('[data-test="confirm"]');
    expect(confirm.text()).toContain(
      'Make chef@example.com a super admin? They will be able to change prices, photos and staff.',
    );
    await confirm.get('[data-test="confirm-yes"]').trigger('click');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/staff/s-chef')).toEqual({ role: 'super_admin' });
    expect(person(wrapper, 'chef@').text()).toContain('Super admin');
    expect(useToastStore().messages.at(-1)?.text).toBe('chef@example.com is now a Super admin.');
  });

  it('makes a super admin a supervisor', async () => {
    const co = member({ id: 's-co', email: 'co@example.com', role: 'super_admin' });
    const fetchMock = routeFetch({
      'GET /admin/staff': () => json([OWNER, co]),
      'PATCH /admin/staff/s-co': () => json({ ...co, role: 'supervisor' }),
    });
    const wrapper = await mountView();
    const row = person(wrapper, 'co@');
    expect(row.get('[data-test="change-role"]').text()).toBe('Make kitchen supervisor');
    await row.get('[data-test="change-role"]').trigger('click');
    expect(person(wrapper, 'co@').get('[data-test="confirm"]').text()).toContain(
      'They will only be able to switch dishes and meats on or off and set meat prices.',
    );
    await person(wrapper, 'co@').get('[data-test="confirm-yes"]').trigger('click');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/staff/s-co')).toEqual({ role: 'supervisor' });
  });

  it('removes staff access after asking, and can give it back', async () => {
    let active = true;
    const fetchMock = routeFetch({
      'GET /admin/staff': () => json([OWNER, CHEF]),
      'PATCH /admin/staff/s-chef': (init) => {
        active = (JSON.parse(init?.body as string) as { isActive: boolean }).isActive;
        return json({
          ...CHEF,
          isActive: active,
          deactivatedAt: active ? null : '2026-10-25T10:00:00Z',
        });
      },
    });
    const wrapper = await mountView();
    await person(wrapper, 'chef@').get('[data-test="deactivate"]').trigger('click');
    expect(person(wrapper, 'chef@').get('[data-test="confirm"]').text()).toContain(
      'Remove staff access for chef@example.com? They can still sign in and order as a customer.',
    );
    await person(wrapper, 'chef@').get('[data-test="confirm-yes"]').trigger('click');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/staff/s-chef')).toEqual({ isActive: false });
    expect(person(wrapper, 'chef@').text()).toContain('No staff access since 25 Oct 2026');
    expect(useToastStore().messages.at(-1)?.text).toBe(
      'chef@example.com no longer has staff access.',
    );

    await person(wrapper, 'chef@').get('[data-test="reactivate"]').trigger('click');
    await flushPromises();
    expect(active).toBe(true);
    expect(person(wrapper, 'chef@').text()).toContain('Kitchen supervisor');
    expect(useToastStore().messages.at(-1)?.text).toBe('chef@example.com has staff access again.');
  });

  it('cancelling a confirmation changes nothing', async () => {
    const fetchMock = routeFetch({ 'GET /admin/staff': () => json([OWNER, CHEF]) });
    const wrapper = await mountView();
    await person(wrapper, 'chef@').get('[data-test="deactivate"]').trigger('click');
    await person(wrapper, 'chef@').get('[data-test="confirm-no"]').trigger('click');
    expect(person(wrapper, 'chef@').find('[data-test="confirm"]').exists()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains a refused change on that row', async () => {
    const co = member({ id: 's-co', email: 'co@example.com', role: 'super_admin' });
    routeFetch({
      'GET /admin/staff': () => json([OWNER, co]),
      'PATCH /admin/staff/s-co': () =>
        failure(409, 'LAST_SUPER_ADMIN', 'There must always be at least one active super admin.'),
    });
    const wrapper = await mountView();
    await person(wrapper, 'co@').get('[data-test="deactivate"]').trigger('click');
    await person(wrapper, 'co@').get('[data-test="confirm-yes"]').trigger('click');
    await flushPromises();
    const row = person(wrapper, 'co@');
    expect(row.get('[role="alert"]').text()).toContain(
      'There must always be at least one active super admin.',
    );
    expect(row.text()).toContain('Super admin');
    expect(person(wrapper, 'owner@').find('[role="alert"]').exists()).toBe(false);
  });

  it('shows an error with a retry when the list cannot load', async () => {
    let calls = 0;
    routeFetch({
      'GET /admin/staff': () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down') : json([OWNER]),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load the staff list.');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-test="staff"]')).toHaveLength(1);
  });

  it('says so when nobody is on the list', async () => {
    routeFetch({ 'GET /admin/staff': () => json([]) });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No staff yet.');
  });
});
