export function parseFrontmatter(src) {
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m)
  if (!match) {
    const diagnostics = /^---(?:\r?\n|$)/.test(src)
      ? [{ line: 1, message: 'Frontmatter opening delimiter has no closing --- delimiter' }]
      : []
    return { data: {}, body: src, diagnostics }
  }
  const body = src.slice(match[0].length)
  const diagnostics = []
  return { data: parseYaml(match[1], diagnostics), body, diagnostics }
}

/**
 * Minimal YAML frontmatter parser supporting:
 *   key: scalar | key: [a, b] | nested objects | lists of scalars and mappings
 *
 * Implemented as an indentation-aware line parser (like Python's yaml for the
 * subset we need). Lists may contain mappings, mappings may nest lists,
 * so section configs like the ones below work:
 *
 *   sections:
 *     - component: Skills
 *       items:
 *         - name: JS
 *           level: 90
 *
 * Literal (`|`) and folded (`>`) block scalars are supported too: every line
 * indented deeper than the key joins the value (newline-joined for `|`,
 * space-joined for `>`; chomping/width indicators like `|-`, `>+` are accepted
 * and treated as clip). See content/frontmatter.md for the exact spec.
 */
function parseYaml(yaml, diagnostics = []) {
  const lines = yaml.split(/\r?\n/)
    .map((text, index) => ({ text, line: index + 1 }))
    .filter((l) => l.text.trim() && !l.text.trim().startsWith('#'))
    .map((l) => ({ indent: (l.text.match(/^\s*/) || [''])[0].length, text: l.text.trim(), line: l.line }))

  let i = 0
  const block = (base = i < lines.length ? lines[i].indent : 0) => {
    const obj = {}
    while (i < lines.length) {
      const { indent, text } = lines[i]
      // A line dedented below this block's own indentation ends the block and
      // returns control to the enclosing scope — otherwise every following
      // top-level key would be swallowed into the last nested map.
      if (indent < base) break
      if (indent === 0 && text.startsWith('- ')) {
        const arr = list()
        obj.__list = arr
        // an unkeyed top-level list is rare; fall through to accept it
        Object.assign(obj, { items: arr })
        return obj
      }
      const kv = splitKV(text)
      if (!kv) {
        diagnostics.push({ line: lines[i].line, message: `Expected "key: value", got "${text}"` })
        i++
        continue
      }
      i++
      const { key, value } = kv
      if (value === '') {
        if (i < lines.length && lines[i].text.startsWith('- ') && lines[i].indent > indent) {
          assign(obj, key, listAt(indent), lines[i - 1].line)
        } else if (i < lines.length && lines[i].indent > indent) {
          assign(obj, key, block(), lines[i - 1].line)
        } else {
          assign(obj, key, {}, lines[i - 1].line)
        }
      } else if (isBlockScalar(value)) {
        assign(obj, key, consumeBlock(indent, value), lines[i - 1].line)
      } else {
        assign(obj, key, parseValue(value), lines[i - 1].line)
      }
    }
    return obj
  }

  // list at deeper indent than the parent line that opened it
  const listAt = (parentIndent) => {
    const list = []
    while (i < lines.length && lines[i].indent > parentIndent) {
      if (!lines[i].text.startsWith('- ')) break
      list.push(item(parentIndent))
    }
    return list
  }

  // standalone list used for unkeyed top-level lists
  const list = () => {
    const arr = []
    while (i < lines.length && lines[i].text.startsWith('- ')) {
      const indent = lines[i].indent
      arr.push(item(indent - 1))
    }
    return arr
  }

  // one `- ` item: either a scalar or a mapping (which may span several lines)
  const item = (parentIndent) => {
    const curr = lines[i]
    const body = curr.text.replace(/^- ?/, '').trim()
    i++
    const kv = splitKV(body)
    if (kv) {
      const entry = {}
      if (kv.value !== '') {
        assign(entry, kv.key, isBlockScalar(kv.value) ? consumeBlock(curr.indent, kv.value) : parseValue(kv.value), curr.line)
      } else {
        // `- key:` with nested content
        if (i < lines.length && lines[i].indent > curr.indent) {
          if (lines[i].text.startsWith('- ')) assign(entry, kv.key, listAt(curr.indent), curr.line)
          else assign(entry, kv.key, block(), curr.line)
        } else {
          assign(entry, kv.key, {}, curr.line)
        }
      }
      // additional `key: value` lines belonging to this item
      if (i < lines.length && lines[i].indent > parentIndent && lines[i].indent >= curr.indent) {
        // lines at exactly the item's indent continue the mapping
        while (i < lines.length && lines[i].indent > parentIndent) {
          const n = lines[i]
          if (n.text.startsWith('- ') || n.indent < curr.indent) break
          const inner = splitKV(n.text)
          if (!inner) { i++; continue }
          i++
          if (inner.value === '') {
            if (i < lines.length && lines[i].indent > n.indent) {
              if (lines[i].text.startsWith('- ')) assign(entry, inner.key, listAt(n.indent), n.line)
              else assign(entry, inner.key, block(), n.line)
            } else {
              assign(entry, inner.key, {}, n.line)
            }
          } else {
            assign(entry, inner.key, isBlockScalar(inner.value) ? consumeBlock(n.indent, inner.value) : parseValue(inner.value), n.line)
          }
        }
      }
      return entry
    }
    // scalar list item
    return parseValue(body)
  }

  return block()

  // `key: |` / `key: >` (with optional chomping/width indicators like `|-`, `>+`)
  // open a block scalar: every following line indented deeper than the key joins
  // the value. Lines are pre-trimmed, so leading whitespace inside the block (and
  // blank lines) are dropped; `|` keeps the line breaks, `>` folds them to spaces.
  // Both behave like YAML's "clip" chomping (a trailing newline, no extras).
  function isBlockScalar(v) {
    return v === '|' || v === '>' || /^[|>][1-9]?[-+]?$/.test(v)
  }

  function consumeBlock(indent, indicator) {
    const chunks = []
    while (i < lines.length && lines[i].indent > indent) {
      chunks.push(lines[i].text)
      i++
    }
    return indicator[0] === '>' ? chunks.join(' ') : chunks.join('\n')
  }

  function assign(target, key, value, line) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      diagnostics.push({ line, message: `Duplicate frontmatter key "${key}"` })
    }
    target[key] = value
  }
}

function splitKV(line) {
  const m = line.match(/^([^:]+):(?:\s+(.*))?$/)
  if (!m) return null
  return { key: m[1].trim(), value: (m[2] ?? '').trim() }
}

function parseValue(value) {
  const v = value.trim()
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((x) => parseValue(x.trim())).filter((x) => x !== '')
  }
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"')
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/\\'/g, "'")
  return v
}