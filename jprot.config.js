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
  email: "hello@example.com",
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
      component: "Stats",
      items: [
        { value: "15+", label: "Projects shipped" },
        { value: "8", label: "Years experience" },
        { value: "40+", label: "Happy clients" },
        { value: "120k", label: "Users reached" },
      ],
    },
    {
      component: "Services",
      title: "What I do",
      subtitle: "Services I offer end to end.",
      items: [
        {
          icon: "✻",
          title: "Web Development",
          description:
            "Fast, accessible sites and apps built with modern tooling.",
        },
        {
          icon: "✺",
          title: "Product Design",
          description: "Interfaces and systems that are simple to use and own.",
        },
        {
          icon: "⚙",
          title: "Dev Tooling",
          description: "CLIs, generators and automation that remove friction.",
        },
        {
          icon: "☾",
          title: "Documentation",
          description: "Clear docs and tutorials people actually finish.",
        },
      ],
    },
    {
      component: "Skills",
      title: "Skills",
      subtitle: "Core tools I work with every day.",
      items: [
        { name: "JavaScript / TypeScript", level: 92 },
        { name: "Node.js", level: 88 },
        { name: "UI / CSS", level: 85 },
        { name: "Markdown & Docs", level: 95 },
      ],
    },
    {
      component: "Experience",
      title: "Experience",
      subtitle: "Where I have been working.",
      items: [
        {
          title: "Senior Developer",
          company: "Acme Inc.",
          period: "2022 — Now",
          description:
            "Leading a team building developer tools, designing architecture and shipping features end-to-end.",
        },
        {
          title: "Frontend Developer",
          company: "StartupHub",
          period: "2019 — 2022",
          description:
            "Built marketing sites and customer-facing dashboards used by thousands of users.",
        },
      ],
    },
    {
      component: "Testimonials",
      title: "Testimonials",
      subtitle: "What clients and colleagues say.",
      items: [
        {
          text: "JPROT is the fastest way we have shipped a documentation site. No build step, no framework lock-in.",
          name: "Sarah K.",
          role: "Engineering Manager",
        },
        {
          text: "Beautiful portfolios with zero boilerplate. The sections system is pure genius.",
          name: "Mohammed A.",
          role: "Product Designer",
        },
      ],
    },
    {
      component: "Awards",
      title: "Awards",
      subtitle: "A few milestones along the way.",
      items: [
        {
          year: "2024",
          title: "Product of the Year",
          org: "DevTools Awards",
          description:
            "Recognized for a distributed-site generator used across 40+ teams.",
        },
        {
          year: "2022",
          title: "Best Storefront",
          org: "CSS Spotlight",
          description: "Storefront Kit won for performance and accessibility.",
        },
      ],
    },
    {
      component: "Education",
      title: "Education",
      subtitle: "Formal training and degrees.",
      items: [
        {
          title: "MSc Computer Science",
          school: "University of Technology",
          period: "2016 — 2018",
          description: "Focus on distributed systems and developer tooling.",
        },
        {
          title: "BSc Software Engineering",
          school: "State University",
          period: "2012 — 2016",
          description: "Graduated with honors.",
        },
      ],
    },
    {
      component: "Clients",
      title: "Clients & partners",
      items: [
        { name: "Acme Corp" },
        { name: "StartupHub" },
        { name: "Northwind" },
        { name: "Globex" },
      ],
    },
    {
      component: "Gallery",
      title: "Gallery",
      subtitle: "A few screens from recent work.",
      items: [
        {
          src: "https://picsum.photos/seed/j1/640/480",
          alt: "Project screenshot",
        },
        { src: "https://picsum.photos/seed/j2/640/480", alt: "Site preview" },
        { src: "https://picsum.photos/seed/j3/640/480", alt: "Design detail" },
        { src: "https://picsum.photos/seed/j4/640/480", alt: "Mobile view" },
      ],
    },
    {
      component: "Contact",
      title: "Contact",
      subtitle: "Let us build something together.",
      // Set this to an address you want visitors to use for contact.
      email: "hello@example.com",
      social: [
      { label: "GitHub", url: "https://github.com/Moaaz-i/JPROT" },
      ],
    },
    {
      component: "CTA",
      title: "Let us start a project",
      text: "Have an idea? Tell me about it and we will make it real.",
      label: "Start a conversation",
      url: "/contact",
    },
  ],

  labels: {
    printResume: "Print",
  },

  footerText: "© 2026 JPROT — Built with JPROT",
};
