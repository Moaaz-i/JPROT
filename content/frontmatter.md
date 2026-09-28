# Frontmatter reference

The block between two `---` lines at the top of a file holds the page's
settings. This page is the **exact spec** of what the parser
(`lib/frontmatter.js`) accepts. Anything not listed here is not part of the
supported subset — it produces a `jprot check` diagnostic, never a crash.

## Structure

```
---
key: value
---
```

- The block must start at the very first bytes of the file (`^---`).
- Closing `---` may carry content immediately after (no blank line required).
- Lines are `LF` or `CRLF`; keys are case-sensitive.
- Lines that are blank or start with `#` are ignored.

## Values

| Syntax | Parses to | Example |
|---|---|---|
| plain text | string | `title: About me` |
| number | number | `order: 1`, `level: 90.5` |
| `true` / `false` | boolean | `hidden: false` |
| `null` / `~` | `null` | `cover: null` |
| `[a, b, c]` | array | `tags: [js, css]` |
| `"double"` | string (escapes honoured) | `title: "Say \"hi\""` |
| `'single'` | string | `desc: "It's fine"` |
| empty | empty object `{}` | `hero:` |

Colons inside a value are fine: `time: 12:30:45`, `url: https://x.com/a:b`.
Date-like values stay strings (`date: 2026-01-15` → `"2026-01-15"`), so
comparisons like `dateKey` in the content graph handle them explicitly.

## Maps and lists

Indentation (two spaces is conventional) nests maps and lists:

```markdown
---
hero:
  title: Hi
links:
  - github
  - x.com
sections:
  - component: Skills
    items:
      - name: JS
        level: 90
---
```

A key followed by deeper-indented lines opens a map; a `- ` line opens a list
item. A line dedented back to the key's level ends the map — later keys stay
top-level:

```markdown
---
a:
  b: 1
c: 2   # top-level, not part of `a`
---
```

## Block scalars

`key: |` collects every following deeper-indented line into one value, keeping
line breaks. `key: >` folds the same lines into a single line. Chomping and
width indicators (`|-`, `>+`, `|2`) are accepted; trailing newlines are clipped.

```markdown
---
hint: |
  First line
  Second line
summary: >
  One sentence
  folded into a line
---
```

Leading whitespace and blank lines inside a block are dropped (each line is
trimmed before joining).

## Diagnostics

`jprot check` reports, without failing the build:

- a missing closing `---` delimiter
- a line that is not `key: value`
- a duplicate key (last value wins)

The parser never throws on any input — garbage yields a diagnostic, not a crash.

## Not supported

- Flow YAML beyond one-line lists: `{a: 1}`, anchors, aliases, tags.
- Quoted keys containing colons (`"my: key": 1`).
- Multi-document files (only the first `---` block is read).
- Block scalars with indentation preserved (content is trimmed).