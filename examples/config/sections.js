// examples/config/sections.js
// Copy the `sections` array into jprot.config.js to add portfolio sections
// to your homepage. Each entry names a component and passes the rest as props.
export const sections = [
  {
    component: 'Stats',
    items: [
      { value: '15+', label: 'Projects shipped' },
      { value: '8', label: 'Years experience' },
      { value: '40+', label: 'Happy clients' },
    ],
  },
  {
    component: 'Skills',
    title: 'Skills',
    subtitle: 'Core tools I work with every day.',
    items: [
      { name: 'JavaScript / TypeScript', level: 92 },
      { name: 'Node.js', level: 88 },
      { name: 'UI / CSS', level: 85 },
      'Markdown', // plain strings default to level 80
    ],
  },
  {
    component: 'Experience',
    title: 'Experience',
    subtitle: 'Where I have been working.',
    items: [
      { title: 'Senior Developer', company: 'Acme Inc.', period: '2022 — Now', description: 'Leading a team building developer tools.' },
      { title: 'Frontend Developer', company: 'StartupHub', period: '2019 — 2022', description: 'Built dashboards used by thousands of users.' },
    ],
  },
  {
    component: 'Testimonials',
    title: 'Testimonials',
    items: [
      { text: 'JPROT is the fastest way to ship a docs site.', name: 'Sarah K.', role: 'Engineering Manager' },
      { text: 'Beautiful portfolios with zero boilerplate.', name: 'Mohammed A.', role: 'Product Designer' },
    ],
  },
  {
    component: 'Gallery',
    title: 'Gallery',
    items: [
      { src: 'https://picsum.photos/seed/j1/640/480', alt: 'Screenshot' },
      { src: 'https://picsum.photos/seed/j2/640/480', alt: 'Site preview' },
    ],
  },
  {
    component: 'Contact',
    title: 'Contact',
    subtitle: 'Let us build something together.',
    email: 'hello@example.com',
    social: [
      { label: 'GitHub', url: 'https://github.com/example' },
      { label: 'X / Twitter', url: 'https://x.com/example' },
    ],
  },
]