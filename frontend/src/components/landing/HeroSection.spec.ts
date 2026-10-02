import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSiteStore } from '@/stores/site';
import { sampleSite } from '@/test-utils/fixtures';
import HeroSection from './HeroSection.vue';

describe('HeroSection', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders the headline and calls to action', () => {
    const wrapper = mount(HeroSection);
    expect(wrapper.get('h1').text()).toBe('The soul of Calabar, served warm.');
    expect(wrapper.get('a[href="#menu"]').text()).toContain('Order now');
    expect(wrapper.get('a[href="#story"]').text()).toBe('Our story');
  });

  it('shows hours and the delivery fee from site info', () => {
    useSiteStore().info = sampleSite();
    const text = mount(HeroSection).text();
    expect(text).toContain('Open daily, 8am – 11pm');
    expect(text).toContain('₦1,500 delivery anywhere in Calabar');
    expect(text).toContain('Or pick up yourself');
  });

  it('omits the facts that depend on site info until it loads', () => {
    const text = mount(HeroSection).text();
    expect(text).not.toContain('Open daily');
    expect(text).toContain('Or pick up yourself');
  });
});
