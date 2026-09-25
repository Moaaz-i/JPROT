// Document rendering: sections, shortcode parsing and the shortcode AST.
//
// A JPROT document is Markdown plus `:::Component` shortcodes. Shortcodes used
// to be handled by a forward scanner that looked for the next `:::` line — fine
// for one level, impossible for nested components:
//
//   :::Tabs
//     :::Tab name="npm"
//     npm install jprot
//     :::
//   :::
//
// The document is now parsed into a small AST first, so nesting, indentation
// and code fences are resolved before anything renders:
//
//   { type: 'markdown',  value: '…' }
//   { type: 'shortcode', name: 'Tabs', attrs: {}, children: [ … ], line: 1 }
import { esc } from './utils.js'

export async function renderSections({ site, page, nav, projects, posts, sections, components = {} }) {
  let out = ''
  for (const sec of sections || []) {
    const name = sec.component || sec.type || ''
    const comp = components[name]
    if (typeof comp !== 'function') continue
    const { component: _component, type: _type, ...rest } = sec;
    const html = await comp({ site, page, nav, projects, posts, ...rest })
    if (html) out += html + '\n'
  }
  return out
}

// `key="value"`, `key='value'`, `key=bare`, numbers, booleans and inline JSON.
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

const OPEN_RE = /^(\s*):::\s*([A-Za-z0-9-]+)(.*)$/
const CLOSE_RE = /^(\s*):::\s*$/
const FENCE_RE = /^\s*```+/

/**
 * Parse a Markdown document into JPROT nodes.
 *
 * @param {string} source Markdown text
 * @returns {Array<{type: 'markdown'|'shortcode'}>} the document AST
 */
export function parseDocument(source) {
  const lines = String(source || '').split(/\r?\n/)
  const root = []
  // Every open shortcode is a frame on this stack, so `:::` always closes the
  // innermost one — that is what makes nesting work.
  const stack = [{ children: root }]
  let buf = []
  let inCode = false

  const flush = () => {
    if (!buf.length) return
    stack[stack.length - 1].children.push({ type: 'markdown', value: buf.join('\n') })
    buf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // A `:::` inside a fenced code block is content, not a shortcode.
    if (FENCE_RE.test(line)) { inCode = !inCode; buf.push(line); continue }
    if (!inCode) {
      const open = line.match(OPEN_RE)
      if (open) {
        flush()
        const node = {
          type: 'shortcode',
          name: open[2],
          attrs: parseAttrs(open[3]),
          attrsRaw: open[3],
          children: [],
          line: i + 1,
          indent: open[1].length,
          closed: false,
        }
        stack[stack.length - 1].children.push(node)
        stack.push(node)
        continue
      }
      if (CLOSE_RE.test(line) && stack.length > 1) {
        flush()
        stack[stack.length - 1].closed = true
        stack.pop()
        continue
      }
    }
    buf.push(line)
  }
  flush()

  // An opening fence with no `:::` is a self-closing shortcode when nothing
  // follows it on the next line, and otherwise a typo. Rather than swallowing
  // the rest of the document (the old scanner's behaviour) the shortcode is
  // unwrapped: its opening line and children go back to being plain Markdown,
  // and rendering continues with the rest of the file.
  // Flatten a shortcode subtree back into its source lines (used when an
  // unterminated shortcode has to become plain Markdown again).
  const flatten = (nodes) => {
    const lines = []
    for (const node of nodes) {
      if (node.type === 'markdown') lines.push(node.value)
      else lines.push(`:::${node.name}${node.attrsRaw || ''}`, ...flatten(node.children), ':::')
    }
    return lines
  }

  // The first source line below an opening fence decides what an unterminated
  // shortcode means: blank (or nothing at all) means the historical
  // self-closing form — `:::Card title="x"` on its own line — otherwise it is a
  // typo. A nested shortcode counts as content.
  const firstChildLine = (node) => {
    const first = node.children[0]
    if (!first) return ''
    if (first.type === 'markdown') return first.value.split('\n')[0]
    return `:::${first.name}`
  }

  const finalize = (nodes) => {
    const out = []
    for (const node of nodes) {
      if (node.type !== 'shortcode' || node.closed) { out.push(node); continue }
      if (firstChildLine(node).trim() === '') {
        // Self-closing: the lines below the opener stay document content, so
        // move them out to the parent's children instead of dropping them.
        const trailing = node.children
        node.children = []
        node.closed = true
        node.selfClosing = true
        out.push(node, ...trailing)
        continue
      }
      // Unterminated with content: emit the raw text instead of silently
      // swallowing the rest of the document.
      out.push({
        type: 'markdown',
        value: [`:::${node.name}${node.attrsRaw || ''}`, ...flatten(node.children)].join('\n'),
      })
    }
    return out
  }

  return finalize(root)
}

// True when a shortcode has no children of its own — it renders with an empty
// `children` prop, exactly like the historical self-closing form.
function isEmpty(node) {
  return !node.children.length
}

async function renderNodes(nodes, ctx) {
  const out = []
  for (const node of nodes) {
    if (node.type === 'markdown') {
      const html = ctx.md.render(node.value, ctx.headings)
      if (html) out.push(html)
      continue
    }
    const { name } = node
    const component = ctx.components[name]
    if (typeof component !== 'function') {
      console.warn(`[jprot] unknown shortcode ::${name} — rendered as a placeholder`)
      out.push(`<div class="jprot-shortcode-missing">Unknown JPROT shortcode ::${esc(name)}</div>`)
      continue
    }
    // Children render first, so a failing parent never leaves a half-rendered
    // subtree behind and nested shortcodes can call each other.
    const children = isEmpty(node) ? '' : await renderNodes(node.children, ctx)
    try {
      const html = await component({ ...ctx.props, ...node.attrs, children })
      if (html) out.push(html + '\n')
    } catch (err) {
      console.warn(`[jprot] shortcode ::${name} failed: ${err.message}`)
      out.push(`<div class="jprot-shortcode-error">Component ::${esc(name)} failed: ${esc(err.message)}</div>`)
    }
  }
  return out.join('\n')
}

/**
 * Render a Markdown body with its shortcodes resolved to component HTML.
 *
 * @param {string} source        Markdown text
 * @param {object} md            a `createMarkdown()` instance
 * @param {object} components    name → component function
 * @param {object} props         shared props passed to every shortcode
 * @param {Array}  [headings]    collects the table of contents
 */
export async function renderDocumentBody(source, md, components, props, headings = []) {
  const ctx = { md, components: components || {}, props: props || {}, headings }
  return renderNodes(parseDocument(source), ctx)
}
