import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSiteStore } from '@/stores/site';
import { sampleSite } from '@/test-utils/fixtures';
import SiteFooter from './SiteFooter.vue';

describe('SiteFooter', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('is the "Visit us" target, with the brand and tagline', () => {
    const wrapper = mount(SiteFooter);
    expect(wrapper.get('footer').attributes('id')).toBe('visit');
    expect(wrapper.text()).toContain('Mustard Seed');
    expect(wrapper.text()).toContain(
      'Efik and Ibibio cooking from Calabar and Uyo, made fresh and delivered warm. Since 2012.',
    );
  });

  it('shows each branch: HQ marked, address placeholder until supplied, online status', () => {
    useSiteStore().info = sampleSite();
    const branches = mount(SiteFooter).findAll('[data-test="branch"]');
    expect(branches.map((b) => b.get('h3').text())).toEqual(['Calabar (HQ)', 'Uyo']);
    expect(branches[0]!.text()).toContain('[CALABAR ADDRESS]');
    expect(branches[0]!.text()).toContain('Cross River State');
    expect(branches[0]!.text()).toContain('Delivery & pickup online');
    expect(branches[1]!.text()).toContain('97 Tunde Ukpehe (Mitama), Uyo');
    expect(branches[1]!.text()).toContain('Akwa Ibom State');
    expect(branches[1]!.text()).toContain('Online ordering soon');
  });

  it('shows the hours and the online-order cut-off from site info', () => {
    useSiteStore().info = sampleSite();
    const hours = mount(SiteFooter).get('[data-test="hours"]');
    expect(hours.get('h3').text()).toBe('Hours & contact');
    expect(hours.text()).toContain('Daily 8am – 11pm');
    expect(hours.text()).toContain('Online orders close 10:30pm');
  });

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

  it('has the copyright line with this year and the domain', () => {
    const year = new Date().getFullYear();
    expect(mount(SiteFooter).get('[data-test="legal"]').text()).toBe(
      `© ${year} Mustard Seed Restaurant & Bar · mustardseed.ng`,
    );
  });

  it('shows a loading state while site info loads', () => {
    useSiteStore().status = 'loading';
    expect(mount(SiteFooter).find('[aria-busy="true"]').exists()).toBe(true);
  });

  it('says when locations fail to load, and a retry recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'r-7' } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json(sampleSite()));
    vi.stubGlobal('fetch', fetchMock);
    const site = useSiteStore();
    await site.load();
    const wrapper = mount(SiteFooter);
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('We couldn’t load our locations and hours.');
    expect(alert.text()).toContain('Reference: r-7');
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[data-test="branch"]')).toHaveLength(2);
  });
});
