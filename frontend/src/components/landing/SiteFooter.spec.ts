import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSiteStore } from '@/stores/site';
import { sampleSite } from '@/test-utils/fixtures';
import SiteFooter from './SiteFooter.vue';

describe('SiteFooter', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows the phone placeholder until a number is supplied', () => {
    useSiteStore().info = sampleSite();
    const wrapper = mount(SiteFooter);
    expect(wrapper.text()).toContain('[PHONE / WHATSAPP]');
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
  });

  it('links the real phone number once supplied', () => {
    useSiteStore().info = sampleSite({ phoneWhatsapp: '+234 800 000 0000' });
    const link = mount(SiteFooter).get('a[href^="tel:"]');
    expect(link.attributes('href')).toBe('tel:+2348000000000');
    expect(link.text()).toBe('+234 800 000 0000');
  });

  it('has the brand line and navigation links', () => {
    const wrapper = mount(SiteFooter);
    expect(wrapper.text()).toContain('Mustard Seed Restaurant & Bar');
    expect(wrapper.text()).toContain('Local classics of Cross River and Akwa Ibom. Since 2012.');
    expect(wrapper.get('a[href="#menu"]').text()).toBe('Order online');
    expect(wrapper.get('a[href="#visit"]').text()).toBe('Find us');
  });
});
