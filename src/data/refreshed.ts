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
  /** A photo to open the page with, the heading laid over it. */
  heroImage?: { src: string; width: number; height: number; alt?: string };
  /** Show the love stories with this tag (a venue's weddings), under storiesHeading. */
  storiesTag?: string;
  storiesHeading?: string;
  /** Move the photo slideshow up, after this many text sections. */
  galleryAfter?: number;
  /** The dark green band at the end; false for none. */
  closing?: false | { heading?: string; text?: string; button?: { label: string; href: string } };
};

const portraitReviews = ['Juanita', 'Emma Frances', 'Sarah Maginness', 'Carla Satram', 'Elle Castle', 'Helen Millar', 'Sinead Dudley'];
const businessReviews = ['Chris Tankard', 'Mel IBANZ', 'Nat Hugill', 'Mitch 12', 'Emma Liston', 'Anna Flanagan'];
const familyReviews = ['Ally Weir', 'Kenjiah Weir', 'Elle Castle', 'Sinead Dudley'];
const portraitClosing = { heading: 'Let’s create something beautiful', text: 'Tell me what you have in mind, and I’ll help you plan a session that brings out the very best of you.' };

const venueClosing = { heading: 'Getting married here?', text: 'Tell me your date, and I’ll let you know if I’m free.', button: { label: 'Check your date', href: '/contact' } };
// Wedding reviews for the venue pages: the couple married there first, where there is one.
const weddingReviews = ['Tayla Johnson', 'Mikaela Ellwood', 'Jade McQuoid', 'Leah Doolan', 'Cerise Brown', 'Josh Stewart', 'Julia Passmore'];
const venue = (name: string, tag: string, first: string[] = []): RefreshOptions => ({
  eyebrow: 'Venue guide',
  storiesTag: tag,
  storiesHeading: `Love stories at ${name}`,
  galleryAfter: 2,
  reviews: [...first, ...weddingReviews.filter((r) => !first.includes(r))].slice(0, 7),
  closing: venueClosing,
});

export const refreshed: Record<string, RefreshOptions> = {
  '/abel-estate': venue('Abel Estate', 'abel-estate'),
  '/the-barn-waimauku-wedding-photographer': venue('The Barn Waimauku', 'the-barn-waimauku', ['Tayla Johnson', 'Mikaela Ellwood']),
  '/kumeu-valley-estate-wedding-photographer': venue('Kumeu Valley Estate', 'kumeu-valley-estate', ['Jade McQuoid']),
  '/markovina-vineyard-estate-wedding-photographer': venue('Markovina Vineyard Estate', 'markovina', ['Paige Eastlake']),
  '/bridgewater-estate-wedding-photographer': venue('Bridgewater Estate', 'bridgewater', ['Leah Doolan']),
  '/settlers-country-manor-wedding-photographer': venue('Settlers Country Manor', 'settlers-country-manor'),
  '/tui-hills': venue('Tui Hills', 'tui-hills', ['Ellen Fenton']),
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
