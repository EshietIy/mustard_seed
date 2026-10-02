/**
 * Landing-page copy from docs/landing-page.pdf. Square-bracket values are placeholders the owner
 * will replace; they live here (data), not in components, so no component changes are needed.
 * Business facts (prices, hours, delivery fee, addresses, phone) come from the API instead.
 */
export const PLACEHOLDERS = {
  phone: '[PHONE / WHATSAPP]',
  address: (city: string) => `[${city.toUpperCase()} ADDRESS]`,
  founderLine: '[ADD A LINE ABOUT THE FOUNDER OR THE NAME "MUSTARD SEED"]',
} as const;

export const landing = {
  brand: {
    name: 'Mustard Seed',
    subtitle: 'Restaurant & Bar',
    fullName: 'Mustard Seed Restaurant & Bar',
  },
  nav: [
    { href: '#menu', label: 'Menu' },
    { href: '#juices', label: 'Fresh juices' },
    { href: '#story', label: 'Our story' },
    { href: '#visit', label: 'Visit us' },
  ],
  hero: {
    eyebrow: 'Amedi · Welcome',
    titleLead: 'The soul of Calabar,',
    titleEmphasis: 'served warm.',
    body: 'Edikang Ikong, Afang, Ekpang Nkukwo and the great pots of Akwa-Cross, cooked the way they have always been. Plus continental favourites and fresh juices pressed every morning.',
    primaryCta: 'Order now',
    secondaryCta: 'Our story',
    pickup: 'Or pick up yourself',
    photoLabel: 'Photo: Edikang Ikong in an earthen pot',
  },
  steps: [
    { title: 'Sign in with Google', body: 'One tap. No new password to remember.' },
    {
      title: 'Pick your food and drinks',
      body: 'Choose delivery to your door or pickup at the restaurant.',
    },
    {
      title: 'Pay online, we start cooking',
      body: 'Your order goes to the kitchen as soon as payment clears. Track it live.',
    },
  ],
  menu: {
    eyebrow: "Today's menu",
    title: 'From our pots to your table',
    emptyCategory: 'More dishes are coming to this part of the menu soon.',
  },
  juices: {
    eyebrow: 'Pressed every morning',
    title: 'Fresh juices. Nothing added, nothing hidden.',
    body: 'No preservatives, ever. Add a bottle to any order — they travel cold with your food.',
    cta: 'See all drinks',
  },
  story: {
    eyebrow: 'Since 2012',
    titleLead: 'Two states. One table.',
    titleEmphasis: 'Akwa-Cross',
    titleTail: 'on every plate.',
    body: 'Efik and Ibibio cooking is a cooking of patience — leaves shredded by hand, soups built slowly, nothing rushed. That is how our kitchen still works, in Calabar and in Uyo.',
    founderLine: PLACEHOLDERS.founderLine,
    photoLabel: 'Photo: the dining room / the kitchen team',
  },
  visit: {
    title: 'Visit us',
    roleLabel: { headquarters: 'Headquarters', branch: 'Branch' },
    onlineAvailable: 'Online delivery and pickup available',
    onlineComingSoon: 'Online ordering coming soon',
    hoursEyebrow: 'Hours',
    events: 'Weddings, birthdays and corporate events hosted on request.',
  },
  footer: {
    tagline: 'Local classics of Cross River and Akwa Ibom. Since 2012.',
    orderOnline: 'Order online',
    findUs: 'Find us',
    domain: 'mustardseed.ng',
  },
} as const;
