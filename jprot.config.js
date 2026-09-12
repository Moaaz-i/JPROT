/**
 * JPROT configuration.
 *
 * This `@type` hint gives you full **autocomplete** for every option
 * directly in your editor (VS Code, Vim/Neovim, etc.) — press Ctrl+Space
 * inside the object to see all available keys.
 *
 *   /** @type {import('jprot').JprotConfig} *\/
 *   export default { ... }
 */
/** @type {import('jprot').JprotConfig} */
export default {
  title: "JPROT",
  tagline: "Write Markdown. Customize everything. No build step.",
  description: "JPROT — a Markdown-driven site generator with no build step.",
  lang: "en",
  dir: "ltr",
  url: "http://127.0.0.1:4114", // used for sitemap.xml, Open Graph and RSS
  basePath: "/JPROT", // static export prefix; remove for a root-domain deployment
  docs: true,
  author: "Moaaz",
  // Set this to an address you want visitors to use for contact.
  email: "moaaz.yahia.shrif@gmail.com",
  themeColor: "#4f46e5",

  // Sidebar: shows on regular (Page) docs pages. Set false to disable.
  sidebar: true,

  // Navbar links: set false to hide the nav links (brand stays).
  showNav: true,
  // Theme picker: cycle button (◈) in the header (Default/Minimal/Creative/Corporate).
  themePicker: true,
  // Keep the public header focused; the full docs remain in the sidebar/search.
  nav: [
    { label: "Docs", url: "/quick-start" },
    { label: "Examples", url: "/examples" },
    { label: "Showcase", url: "/showcase" },
    { label: "Publish", url: "/deploy" },
    { label: "GitHub", url: "https://github.com/Moaaz-i/JPROT" },
  ],

  hero: {
    avatar: "",
    title: "JPROT",
    subtitle: "Write Markdown. Customize everything. No build step.",
    links: [
      { label: "Docs", url: "/getting-started" },
      { label: "GitHub", url: "https://github.com/Moaaz-i/JPROT" },
    ],
  },

  projectsTitle: "Latest Projects",

  sections: [
    {
      component: "Contact",
      title: "Contact",
      subtitle: "Let us build something together.",
      email: "moaaz.yahia.shrif@gmail.com",
      social: [{ label: "GitHub", url: "https://github.com/Moaaz-i/JPROT" }],
    },
    {
      component: "CTA",
      title: "Let us start a project",
      text: "Have an idea? Tell me about it and we will make it real.",
      label: "Start a conversation",
      url: "mailto:moaaz.yahia.shrif@gmail.com",
    },
  ],

  labels: {
    printResume: "Print",
  },

  footerText: "© 2026 JPROT — Built with JPROT",
};
