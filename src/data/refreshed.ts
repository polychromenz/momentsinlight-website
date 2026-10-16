// Imported pages shown in the refreshed design (src/components/page/RefreshedPage.astro),
// keyed by address, with the small extras each one needs. A page not listed here keeps its
// original Squarespace layout.
export type RefreshOptions = {
  /** Small capitals above the page heading. */
  eyebrow?: string;
  /** Buttons under the intro. */
  buttons?: { label: string; href: string; outline?: boolean }[];
  /** Google reviewers (by name, as in src/data/reviews.json) for a review carousel. */
  reviews?: string[];
  /** Words on the cards' hover shade. */
  linkLabel?: string;
  /** The dark green band at the end; false for none. */
  closing?: false | { heading?: string; text?: string; button?: { label: string; href: string } };
};

const portraitReviews = ['Juanita', 'Emma Frances', 'Sarah Maginness', 'Carla Satram', 'Elle Castle', 'Helen Millar', 'Sinead Dudley'];
const businessReviews = ['Chris Tankard', 'Mel IBANZ', 'Nat Hugill', 'Mitch 12', 'Emma Liston', 'Anna Flanagan'];
const familyReviews = ['Ally Weir', 'Kenjiah Weir', 'Elle Castle', 'Sinead Dudley'];
const portraitClosing = { heading: 'Let’s create something beautiful', text: 'Tell me what you have in mind, and I’ll help you plan a session that brings out the very best of you.' };

export const refreshed: Record<string, RefreshOptions> = {
  '/portraits-gallery': {
    eyebrow: 'Portrait galleries',
    buttons: [{ label: 'Portrait sessions', href: '/portraits' }, { label: 'Testimonials', href: '/testimonials', outline: true }],
    reviews: portraitReviews,
    closing: portraitClosing,
  },
  '/family-galleries': {
    eyebrow: 'Family galleries',
    buttons: [{ label: 'Family sessions', href: '/family' }, { label: 'Testimonials', href: '/testimonials', outline: true }],
    reviews: familyReviews,
    closing: { heading: 'Let’s capture your family', text: 'Tell me a little about your family and where you’d love your photos taken.' },
  },
  '/portraits': {
    eyebrow: 'Auckland portrait photographer',
    buttons: [{ label: 'See portrait galleries', href: '/portraits-gallery' }, { label: 'Get in touch', href: '/contact', outline: true }],
    reviews: portraitReviews,
    closing: portraitClosing,
  },
  '/premium-portraits': {
    reviews: portraitReviews,
    closing: { heading: 'Book your premium portrait experience', text: 'Tell me a little about what you have in mind and I’ll take care of the rest.', button: { label: 'Get in touch', href: '/contact' } },
  },
  '/lifestyle': {
    eyebrow: 'Lifestyle portraits',
    reviews: businessReviews,
    closing: { heading: 'Fresh images for your brand', text: 'Tell me what you need for your website and social media, and I’ll let you know about the next session.' },
  },
  '/headshots': {
    eyebrow: 'Auckland headshots',
    reviews: businessReviews,
    closing: { heading: 'Headshots for you or your whole team', text: 'Tell me how many people and where, and I’ll bring the studio to you.' },
  },
  '/family': {
    eyebrow: 'Family photographer Auckland',
    buttons: [{ label: 'See family galleries', href: '/family-galleries' }, { label: 'Get in touch', href: '/contact', outline: true }],
    reviews: familyReviews,
    closing: { heading: 'Let’s capture your family', text: 'Tell me a little about your family and where you’d love your photos taken.' },
  },
  '/wedding-resources': {
    eyebrow: 'Planning your wedding',
    buttons: [{ label: 'Love stories', href: '/wedding-galleries' }, { label: 'Wedding packages', href: '/weddings', outline: true }],
    closing: { heading: 'Is your date still free?', text: 'Tell me your date and venue, and I’ll let you know.', button: { label: 'Check your date', href: '/contact' } },
  },
  '/about': {
    eyebrow: 'Hello, I’m Tony',
    reviews: ['Cerise Brown', 'Leah Doolan', 'Janine Kruger', 'Steven Dove', 'Shannon Boyes', 'Tayla Johnson'],
    closing: { heading: 'I’d love to hear about your plans', text: 'Whether it’s a wedding or a portrait session, get in touch anytime to chat.', button: { label: 'Get in touch', href: '/contact' } },
  },
};
