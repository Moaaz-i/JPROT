/* =========================================================
   Example component: Home.js (replaces the default homepage)
   Copy this file to  theme/components/Home.js
   ========================================================= */

export default async function Home({ site, page, content, projects }) {
  const hero = page.data.hero || site.hero || {}
  const cards = (projects || []).map((p) => {
    const tags = (p.data.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')
    return `
      <article class="project-card">
        <h3><a href="/${p.url}">${p.data.title || p.slug}</a></h3>
        <p>${p.data.excerpt || ''}</p>
        <div>${tags}</div>
      </article>
    `
  }).join('')

  return `
    <section class="hero">
      <h1>${site.title || ''}</h1>
      <p class="hero-subtitle">${site.tagline || ''}</p>
      ${content}
      <div class="projects-grid">${cards}</div>
    </section>
  `
}