// Site-wide settings, navigation and footer, matching the live Squarespace site.
// Brand images live in src/assets/brand and are resized by Astro's <Image> at build time.
import logo from '../assets/brand/logo-black.webp';
import monogramWhite from '../assets/brand/monogram-white.webp';
import badgeMyWeddingGuide from '../assets/brand/badge-my-wedding-guide.webp';
import badgeBrideAndGroom from '../assets/brand/badge-bride-and-groom.webp';
import badgeMyWed from '../assets/brand/badge-mywed.webp';

export const site = {
  name: 'Moments In Light',
  url: 'https://www.momentsinlight.co.nz',
  author: 'Tony Gorham',
  address: '985a Hibiscus Coast Highway, Waiwera, Auckland 0994',
  phone: '021 625 943',
  logo,
  monogramWhite,
};

// Tracking IDs, carried over from the Squarespace site. Leave one empty to turn it off.
export const tracking = {
  googleAnalytics: 'G-6S72EDGXNK',
  metaPixel: '813954996871495',
};

export const announcement = {
  text: 'For a limited time, $500 off weddings. Book now to secure your date!',
  href: '/contact',
};

export type NavItem = { label: string; href: string; children?: { label: string; href: string }[] };

export const nav: NavItem[] = [
  { label: 'Weddings', href: '/weddings' },
  {
    label: 'Galleries',
    href: '/galleries-menu',
    children: [
      { label: 'Love Stories', href: '/wedding-galleries' },
      { label: 'Portraits Gallery', href: '/portraits-gallery' },
      { label: 'Family Galleries', href: '/family-galleries' },
    ],
  },
  {
    label: 'Portraits',
    href: '/portraits-1',
    children: [
      { label: 'Portraits', href: '/portraits' },
      { label: 'Premium Portraits', href: '/premium-portraits' },
      { label: 'Lifestyle', href: '/lifestyle' },
      { label: 'Headshots', href: '/headshots' },
      { label: 'Family', href: '/family' },
    ],
  },
  {
    label: 'Venues',
    href: '/wedding-venues',
    children: [
      { label: 'West Auckland Wedding Venues', href: '/west-auckland-wedding-venues' },
      { label: 'Abel Estate', href: '/abel-estate' },
      { label: 'Bridgewater Estate', href: '/bridgewater-estate-wedding-photographer' },
      { label: 'Kumeu Valley Estate', href: '/kumeu-valley-estate-wedding-photographer' },
      { label: 'Markovina Vineyard Estate', href: '/markovina-vineyard-estate-wedding-photographer' },
      { label: 'Settlers Country Manor', href: '/settlers-country-manor-wedding-photographer' },
      { label: 'The Barn Waimauku', href: '/the-barn-waimauku-wedding-photographer' },
      { label: 'Tui Hills', href: '/tui-hills' },
    ],
  },
  {
    label: 'More',
    href: '/more',
    children: [
      { label: 'Wedding Photo Guide', href: '/wedding-photo-guide' },
      { label: 'Wedding Resources', href: '/wedding-resources' },
      { label: 'Testimonials', href: '/testimonials' },
      { label: 'About', href: '/about' },
    ],
  },
];

export const cta = { label: 'Check now to see if your date is available', href: '/contact' };

export const badges = [
  {
    href: 'https://www.myweddingguide.co.nz/listing/296253/moments-in-light',
    src: badgeMyWeddingGuide,
    alt: 'Featured in My Wedding Guide',
  },
  {
    href: 'https://www.brideandgroom.co.nz/photography-and-film/moments-in-light',
    src: badgeBrideAndGroom,
    alt: 'As seen on Bride & Groom online',
  },
  {
    href: 'https://mywed.com/en/photographer/momentsinlight/',
    src: badgeMyWed,
    alt: 'MyWed photographer profile',
  },
];

export const social = [
  { label: 'Instagram', href: 'https://www.instagram.com/momentsinlightnz' },
  { label: 'Facebook', href: 'https://www.facebook.com/momentsinlightnz/' },
  { label: 'Pinterest', href: 'https://nz.pinterest.com/momentsinlightnz' },
];
