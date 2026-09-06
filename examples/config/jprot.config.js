/* =========================================================
   Example FULL config with complete typing + autocomplete
   ---------------------------------------------------------
   Copy this file into your project root as  jprot.config.js
   and edit the values.

   The /** @type *\/ hint enables full autocomplete:
   press Ctrl+Space inside the object to see every available
   option (title, hero, sections, labels, themes, ...) plus
   inline JSDoc descriptions.
   ========================================================= */

/** @type {import('jprot').JprotConfig} */
export default {
  // --- Site identity ---
  title: 'Your Name',
  tagline: 'Short phrase about what you do.',
  description: 'SEO description shown in <meta name="description">.',
  url: 'https://yoursite.com', // used by sitemap, Open Graph and RSS
  author: 'Your Name',
  email: 'you@example.com',
  lang: 'en',
  dir: 'ltr',

  // --- PWA / browser chrome ---
  themeColor: '#4f46e5',   // manifest + favicon + og-image base color
  icon: '/img/icon.svg',   // manifest icon (put file in public/img)

  // --- Header / nav ---
  showNav: true,           // hide nav links if false (brand stays)
  themePicker: true,       // ◈ button cycles Default/Minimal/Creative/Corporate

  // --- Layout ---
  homeLayout: 'Home',
  defaultLayout: 'Page',
  sidebar: false,          // show sidebar on docs pages
  projectsDir: 'projects',
  blogDir: 'blog',

  // --- Homepage hero (used by the default Home component) ---
  hero: {
    title: 'Hello, I am Your Name',
    subtitle: 'One line about you.',
    avatar: '/img/avatar.png', // put the file in public/img/
    links: [
      { label: 'Projects', url: '#projects' },
      { label: 'Contact', url: 'mailto:you@example.com' },
    ],
  },

  projectsTitle: 'Selected Work',

  // --- Site-wide sections (render on the homepage, in order) ---
  sections: [
    { component: 'Stats', items: [{ value: '12+', label: 'Projects' }] },
    { component: 'Contact', title: 'Get in touch', email: 'you@example.com' },
  ],

  // --- Reachable contact form (replaces mailto when set) ---
  // formspree: 'https://formspree.io/f/YOUR_ID',

  // --- Custom navigation (optional, overrides auto-generated nav) ---
  // nav: [
  //   { label: 'About', url: '/' },
  //   { label: 'Blog', url: '/blog' },
  // ],

  // --- Markdown parser options (all default true) ---
  // markdown: { tables: true, highlight: true },

  // --- Override built-in UI strings (i18n / branding) ---
  labels: {
    projects: 'Projects',
    blog: 'Blog',
    onThisPage: 'On this page',
    printResume: 'Download / Print',
  },

  // --- Theme variants offered by the picker ---
  // themes: [
  //   { id: 'default', label: 'Default', swatch: '#4f46e5' },
  //   { id: 'minimal', label: 'Minimal', swatch: '#111111' },
  // ],

  // --- Extra tags injected into <head> ---
  head: `
    <link rel="preconnect" href="https://fonts.googleapis.com">
  `,
}
