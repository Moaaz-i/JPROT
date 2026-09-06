import { esc } from './utils.js'

export async function renderSections({ site, page, nav, projects, posts, sections, components = {} }) {
  let out = ''
  for (const sec of sections || []) {
    const name = sec.component || sec.type || ''
    const comp = components[name]
    if (typeof comp !== 'function') continue
    const html = await comp({ site, page, nav, projects, posts, ...sec })
    if (html) out += html + '\n'
  }
  return out
}

export function parseAttrs(attrs) {
  const out = {}
  for (const m of String(attrs || '').matchAll(/([A-Za-z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    let value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (/^-?\d+$/.test(value)) value = Number(value)
    else if (/^[\[{]/.test(value)) {
      try { value = JSON.parse(value) } catch { /* preserve malformed JSON as text */ }
    }
    out[m[1]] = value
  }
  return out
}

export async function renderDocumentBody(source, md, components, props, headings = []) {
  const lines = String(source || '').split(/\r?\n/)
  const out = []
  let buf = []
  let i = 0
  let inCode = false
  const flush = () => {
    if (buf.length) { out.push(md.render(buf.join('\n'), headings)); buf = [] }
  }

  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*```+/.test(line)) { inCode = !inCode; buf.push(line); i++; continue }
    const match = line.match(/^:::\s*([A-Za-z0-9-]+)(.*)$/)
    if (match && !inCode) {
      flush()
      const name = match[1]
      const component = components[name]
      if (typeof component !== 'function') {
        out.push(`<div class="jprot-shortcode-missing">Unknown JPROT shortcode ::${esc(name)}</div>`)
        i++
        continue
      }
      const attrs = parseAttrs(match[2])
      i++
      const inner = []
      while (i < lines.length && !/^\s*:::\s*$/.test(lines[i].trim())) inner.push(lines[i++])
      if (i < lines.length) i++
      const children = await renderDocumentBody(inner.join('\n'), md, components, props, headings)
      try {
        const html = await component({ ...props, ...attrs, children })
        if (html) out.push(html + '\n')
      } catch (err) {
        console.warn(`[jprot] shortcode ::${name} failed: ${err.message}`)
        out.push(`<div class="jprot-shortcode-error">Component ::${esc(name)} failed: ${esc(err.message)}</div>`)
      }
      continue
    }
    buf.push(line)
    i++
  }
  flush()
  return out.join('\n')
}
