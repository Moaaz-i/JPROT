export function parseFrontmatter(src) {
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m)
  if (!match) return { data: {}, body: src }
  const body = src.slice(match[0].length)
  return { data: parseYaml(match[1]), body }
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
 */
function parseYaml(yaml) {
  const lines = yaml.split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => ({ indent: (l.match(/^\s*/) || [''])[0].length, text: l.trim() }))

  let i = 0
  const block = () => {
    const obj = {}
    while (i < lines.length) {
      const { indent, text } = lines[i]
      if (indent === 0 && text.startsWith('- ')) {
        const arr = list()
        obj.__list = arr
        // an unkeyed top-level list is rare; fall through to accept it
        Object.assign(obj, { items: arr })
        return obj
      }
      const kv = splitKV(text)
      if (!kv) break
      i++
      const { key, value } = kv
      if (value === '') {
        if (i < lines.length && lines[i].text.startsWith('- ') && lines[i].indent > indent) {
          obj[key] = listAt(indent)
        } else if (i < lines.length && lines[i].indent > indent) {
          obj[key] = block()
        } else {
          obj[key] = {}
        }
      } else {
        obj[key] = parseValue(value)
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
        entry[kv.key] = parseValue(kv.value)
      } else {
        // `- key:` with nested content
        if (i < lines.length && lines[i].indent > curr.indent) {
          if (lines[i].text.startsWith('- ')) entry[kv.key] = listAt(curr.indent)
          else entry[kv.key] = block()
        } else {
          entry[kv.key] = {}
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
              if (lines[i].text.startsWith('- ')) entry[inner.key] = listAt(n.indent)
              else entry[inner.key] = block()
            } else {
              entry[inner.key] = {}
            }
          } else {
            entry[inner.key] = parseValue(inner.value)
          }
        }
      }
      return entry
    }
    // scalar list item
    return parseValue(body)
  }

  return block()
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
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
  return v
}