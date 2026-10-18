import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_CATEGORIES, useMenuStore } from '@/stores/menu';
import { useSiteStore } from '@/stores/site';
import { sampleSite } from '@/test-utils/fixtures';
import HeroSection from './HeroSection.vue';

describe('HeroSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '<div id="menu"></div>';
    // jsdom has no scrolling; each test that cares replaces this with its own spy.
    document.getElementById('menu')!.scrollIntoView = vi.fn();
  });

  it('renders the badge, headline and intro', () => {
    const wrapper = mount(HeroSection);
    expect(wrapper.text()).toContain("Amedi · Calabar's own since 2012");
    expect(wrapper.get('h1').text()).toBe('Calabar flavour, at your door.');
    expect(wrapper.get('h1 em').text()).toBe('door.');
    expect(wrapper.text()).toContain('cooked fresh in our Calabar kitchen');
  });

  describe('search', () => {
    it('searches the menu and scrolls to it', async () => {
      const scrollIntoView = vi.fn();
      document.getElementById('menu')!.scrollIntoView = scrollIntoView;
      const menu = useMenuStore();
      menu.activeCategory = 'swallow';
      const wrapper = mount(HeroSection);
      await wrapper.get('input[type="search"]').setValue('  Afang ');
      await wrapper.get('form').trigger('submit');
      expect(menu.query).toBe('Afang');
      expect(menu.activeCategory).toBe(ALL_CATEGORIES);
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it('has a labelled search box', () => {
      const wrapper = mount(HeroSection);
      const input = wrapper.get('input[type="search"]');
      expect(input.attributes('placeholder')).toBe('What are you craving? (e.g. Afang)');
      expect(wrapper.get(`label[for="${input.attributes('id')}"]`).text()).toBe('Search the menu');
    });

    it('an empty search just goes to the full menu', async () => {
      const menu = useMenuStore();
      menu.query = 'old';
      const wrapper = mount(HeroSection);
      await wrapper.get('form').trigger('submit');
      expect(menu.query).toBe('');
    });

    it('Quick find chips search for their word', async () => {
      const wrapper = mount(HeroSection);
      const chips = wrapper.findAll('[data-test="quick-find"] button');
      expect(chips.map((c) => c.text())).toEqual(['Afang', 'Fish', 'Pounded yam', 'Fresh juice']);
      await chips[3]!.trigger('click');
      expect(useMenuStore().query).toBe('Fresh juice');
    });
  });

  describe('carousel', () => {
    const caption = (wrapper: ReturnType<typeof mount>) =>
      wrapper.get('[data-test="slide-caption"]').text();

    it('starts on the first of five slides', () => {
      const wrapper = mount(HeroSection);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      expect(wrapper.findAll('[data-test="dot"]')).toHaveLength(5);
      expect(wrapper.findAll('[data-test="dot"]')[0]!.attributes('aria-current')).toBe('true');
    });

    it('moves forward and back, wrapping at the ends', async () => {
      const wrapper = mount(HeroSection);
      const next = wrapper.get('button[aria-label="Next photo"]');
      const previous = wrapper.get('button[aria-label="Previous photo"]');
      await previous.trigger('click');
      expect(caption(wrapper)).toBe('5 / 5 · Fresh juices, pressed daily');
      await next.trigger('click');
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      for (let i = 0; i < 3; i++) await next.trigger('click');
      expect(caption(wrapper)).toBe('4 / 5 · The bar');
      expect(wrapper.find('.placeholder').text()).toBe('Photo: The bar');
    });

    it('jumps to a slide from its dot', async () => {
      const wrapper = mount(HeroSection);
      await wrapper.findAll('[data-test="dot"]')[4]!.trigger('click');
      expect(caption(wrapper)).toBe('5 / 5 · Fresh juices, pressed daily');
    });

    it('announces slide changes politely', () => {
      const wrapper = mount(HeroSection);
      expect(wrapper.get('[data-test="slide-caption"]').attributes('aria-live')).toBe('polite');
    });
  });

  describe('info cards', () => {
    it('show the branches, delivery fee, hours and juices from site info', () => {
      useSiteStore().info = sampleSite();
      const text = mount(HeroSection).text();
      expect(text).toContain('Calabar & Uyo');
      expect(text).toContain('Two kitchens, one recipe book');
      expect(text).toContain('Delivery');
      expect(text).toContain('₦1,500');
      expect(text).toContain('anywhere in Calabar');
      expect(text).toContain('Open 8am – 11pm');
      expect(text).toContain('Online orders until 10:30pm');
      expect(text).toContain('Fresh juices, no preservatives');
    });

    it('leave out the facts that depend on site info until it loads', () => {
      const text = mount(HeroSection).text();
      expect(text).not.toContain('₦1,500');
      expect(text).not.toContain('Open 8am');
      expect(text).toContain('Fresh juices, no preservatives');
    });
  });
});
