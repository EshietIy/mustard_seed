import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSiteStore } from '@/stores/site';
import { sampleSite } from '@/test-utils/fixtures';
import VisitSection from './VisitSection.vue';

describe('VisitSection', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function mountWith(info = sampleSite()) {
    const site = useSiteStore();
    site.info = info;
    site.status = 'ready';
    return mount(VisitSection);
  }

  it('shows both branches and the hours card', () => {
    const text = mountWith().text();
    expect(text).toContain('Headquarters');
    expect(text).toContain('Calabar');
    expect(text).toContain('Cross River State');
    expect(text).toContain('Online delivery and pickup available');
    expect(text).toContain('Branch');
    expect(text).toContain('97 Tunde Ukpehe (Mitama), Uyo');
    expect(text).toContain('Online ordering coming soon');
    expect(text).toContain('8am – 11pm daily');
    expect(text).toContain('Online orders close at 10:30pm.');
    expect(text).toContain('Weddings, birthdays and corporate events hosted on request.');
  });

  it('renders the address placeholder until the real address is supplied', () => {
    expect(mountWith().text()).toContain('[CALABAR ADDRESS]');
  });

  it('renders the real address once supplied', () => {
    const info = sampleSite();
    info.branches[0]!.streetAddress = '12 Example Street, Calabar';
    const text = mountWith(info).text();
    expect(text).toContain('12 Example Street, Calabar');
    expect(text).not.toContain('[CALABAR ADDRESS]');
  });

  it('shows an error state with retry when site info fails to load', () => {
    const site = useSiteStore();
    site.status = 'error';
    const wrapper = mount(VisitSection);
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load our locations.');
    expect(wrapper.get('[role="alert"] button').text()).toBe('Try again');
  });
});
