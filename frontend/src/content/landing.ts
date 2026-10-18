/**
 * Landing-page copy from docs/landing-page.pdf. Square-bracket values are placeholders the owner
 * will replace; they live here (data), not in components, so no component changes are needed.
 * Business facts (prices, hours, delivery fee, addresses, phone) come from the API instead.
 */
export const PLACEHOLDERS = {
  phone: '[PHONE / WHATSAPP]',
  address: (city: string) => `[${city.toUpperCase()} ADDRESS]`,
} as const;

export const landing = {
  brand: {
    name: 'Mustard Seed',
    subtitle: 'Restaurant & Bar',
    fullName: 'Mustard Seed Restaurant & Bar',
    domain: 'mustardseed.ng',
  },
  nav: [
    { href: '#top', label: 'Home' },
    { href: '#menu', label: 'Menu' },
    { href: '#visit', label: 'Visit us' },
  ],
  orderNow: 'Order now',
  hero: {
    badge: "Amedi · Calabar's own since 2012",
    titleLead: 'Calabar flavour,',
    titleTail: 'at your',
    titleEmphasis: 'door.',
    body: 'Edikang Ikong, Afang, Ekpang Nkukwo and more, cooked fresh in our Calabar kitchen. Delivered across the city, or ready for you to pick up.',
    searchLabel: 'Search the menu',
    searchPlaceholder: 'What are you craving? (e.g. Afang)',
    searchButton: 'Search',
    quickFindLabel: 'Quick find',
    quickFind: ['Afang', 'Fish', 'Pounded yam', 'Fresh juice'],
    /**
     * Carousel slides, in order. The design names slides 4 and 5 only; the others stay
     * "Photo coming" until the owner supplies photos and captions.
     */
    slides: [
      { caption: 'Photo coming', photoLabel: 'Photo coming' },
      { caption: 'Photo coming', photoLabel: 'Photo coming' },
      { caption: 'Photo coming', photoLabel: 'Photo coming' },
      { caption: 'The bar', photoLabel: 'Photo: The bar' },
      { caption: 'Fresh juices, pressed daily', photoLabel: 'Photo: Fresh juices, pressed daily' },
    ],
    branchesCard: { title: 'Calabar & Uyo', body: 'Two kitchens, one recipe book' },
    juicesCard: 'Fresh juices, no preservatives',
  },
  topDishes: {
    eyebrow: 'House signatures',
    title: 'Top dishes',
  },
  menu: {
    titleLead: 'Our',
    titleEmphasis: 'menu',
    body: 'Food and non-alcoholic drinks for delivery or pickup.',
    allLabel: 'All',
    searchLabel: 'Search dishes, ingredients…',
    /** Cards shown before "Show full menu". */
    initialCount: 8,
    emptyCategory: 'More dishes are coming to this part of the menu soon.',
    clearSearch: 'Clear search',
  },
  footer: {
    tagline:
      'Efik and Ibibio cooking from Calabar and Uyo, made fresh and delivered warm. Since 2012.',
    headquartersSuffix: '(HQ)',
    onlineAvailable: 'Delivery & pickup online',
    onlineComingSoon: 'Online ordering soon',
    hoursTitle: 'Hours & contact',
  },
} as const;
