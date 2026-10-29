import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  });

  describe('slideshow', () => {
    const caption = (wrapper: ReturnType<typeof mount>) =>
      wrapper.get('[data-test="slide-caption"]').text();
    const pauseButton = (wrapper: ReturnType<typeof mount>) =>
      wrapper.get('[data-test="autoplay"]');
    const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('moves to the next photo every 6 seconds, wrapping at the end', async () => {
      const wrapper = mount(HeroSection);
      await wait(5_999);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      await wait(1);
      expect(caption(wrapper)).toBe('2 / 5 · Photo coming');
      await wait(6_000 * 4);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
    });

    it('starts the wait again after the visitor picks a photo', async () => {
      const wrapper = mount(HeroSection);
      await wait(4_000);
      await wrapper.get('button[aria-label="Next photo"]').trigger('click');
      await wait(4_000);
      expect(caption(wrapper)).toBe('2 / 5 · Photo coming');
      await wait(2_000);
      expect(caption(wrapper)).toBe('3 / 5 · Photo coming');
    });

    it('can be paused and played again with its button', async () => {
      const wrapper = mount(HeroSection);
      expect(pauseButton(wrapper).attributes('aria-label')).toBe('Pause the slideshow');
      await pauseButton(wrapper).trigger('click');
      expect(pauseButton(wrapper).attributes('aria-label')).toBe('Play the slideshow');
      await wait(30_000);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      await pauseButton(wrapper).trigger('click');
      await wait(6_000);
      expect(caption(wrapper)).toBe('2 / 5 · Photo coming');
    });

    it('holds still while the pointer is over it', async () => {
      const wrapper = mount(HeroSection);
      await wrapper.get('[data-test="carousel"]').trigger('mouseenter');
      await wait(30_000);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      await wrapper.get('[data-test="carousel"]').trigger('mouseleave');
      await wait(6_000);
      expect(caption(wrapper)).toBe('2 / 5 · Photo coming');
    });

    it('holds still while keyboard focus is inside it', async () => {
      const wrapper = mount(HeroSection, { attachTo: document.body });
      const next = wrapper.get('button[aria-label="Next photo"]');
      await next.trigger('focusin');
      await wait(30_000);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      await next.trigger('focusout', { relatedTarget: null });
      await wait(6_000);
      expect(caption(wrapper)).toBe('2 / 5 · Photo coming');
      wrapper.unmount();
    });

    it('plays on after a mouse click once the pointer leaves', async () => {
      const wrapper = mount(HeroSection, { attachTo: document.body });
      const carousel = wrapper.get('[data-test="carousel"]');
      await carousel.trigger('mouseenter');
      const next = wrapper.get('button[aria-label="Next photo"]');
      await next.trigger('focusin');
      await next.trigger('click');
      await carousel.trigger('mouseleave');
      await wait(6_000);
      expect(caption(wrapper)).toBe('3 / 5 · Photo coming');
      wrapper.unmount();
    });

    it('waits while the browser tab is hidden', async () => {
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      const wrapper = mount(HeroSection);
      await wait(30_000);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
      hidden.mockReturnValue(false);
      await wait(6_000);
      expect(caption(wrapper)).toBe('2 / 5 · Photo coming');
      hidden.mockRestore();
    });

    it('starts paused for visitors who ask for less motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      }));
      const wrapper = mount(HeroSection);
      expect(pauseButton(wrapper).attributes('aria-label')).toBe('Play the slideshow');
      await wait(30_000);
      expect(caption(wrapper)).toBe('1 / 5 · Photo coming');
    });

    it('does not announce every automatic change to screen readers', async () => {
      const wrapper = mount(HeroSection);
      expect(wrapper.get('[data-test="slide-caption"]').attributes('aria-live')).toBe('off');
      await pauseButton(wrapper).trigger('click');
      expect(wrapper.get('[data-test="slide-caption"]').attributes('aria-live')).toBe('polite');
    });

    it('stops when the page leaves', async () => {
      const wrapper = mount(HeroSection);
      wrapper.unmount();
      expect(vi.getTimerCount()).toBe(0);
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
