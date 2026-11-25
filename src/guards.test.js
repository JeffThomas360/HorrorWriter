// Guards against bloat creeping back. Each test fails the moment a change
// leaves something behind that nothing uses, or makes reader pages heavier.
// They run in CI with the rest of `vitest`, so a crack shows up on the PR that
// made it, not months later.
//
// When one fails, the message says what to do. The usual fix is to delete the
// leftover. Only add to an allow-list with a one-line reason next to it.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(ROOT, p).split('\\').join('/')
const read = (p) => readFileSync(p, 'utf8')

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])
}

const isTest = (f) => /\.test\.[jt]sx?$/.test(f)
const CODE = /\.(jsx?|tsx?|mjs|astro)$/
const SRC = walk(join(ROOT, 'src')).filter((f) => CODE.test(f) || f.endsWith('.css'))
const CONFIGS = ['astro.config.mjs', 'vitest.config.js', 'vitest.setup.js', 'playwright.config.js']
  .map((f) => join(ROOT, f)).filter(existsSync)

// --- import parsing -------------------------------------------------------
// Good enough for this codebase: ES imports, re-exports, dynamic import(),
// and CSS @import. Comments are stripped first so examples in prose don't count.

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

function parseImports(file) {
  const text = stripComments(read(file))
  const out = []
  const staticRe = /(?:^|[\s;}])(?:import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g
  for (const m of text.matchAll(staticRe)) out.push({ spec: m[3], clause: m[2], dynamic: false })
  for (const m of text.matchAll(/(?:^|[\s;])import\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], clause: '', dynamic: false })
  for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], clause: '*', dynamic: true })
  for (const m of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)) out.push({ spec: m[1], clause: '', dynamic: false })
  return out
}

const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.astro', '.css', '/index.js', '/index.jsx']
function resolveLocal(from, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  for (const e of EXTS) {
    const p = base + e
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

const pkgName = (spec) => {
  if (spec.startsWith('.') || spec.startsWith('/') || /^(node|astro|virtual|npm|jsr|https?):/.test(spec)) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const IMPORTS = new Map([...SRC, ...CONFIGS].map((f) => [f, parseImports(f)]))

// Files Astro or Vite load by convention rather than by import.
const ENTRIES = [
  ...SRC.filter((f) => rel(f).startsWith('src/pages/')),
  join(ROOT, 'src/middleware.js'),
  join(ROOT, 'src/content.config.js'),
  ...CONFIGS,
].filter(existsSync)

function closure(roots, { staticOnly = false, skipTests = true } = {}) {
  const seen = new Set()
  const packages = new Set()
  const stack = [...roots]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const imp of IMPORTS.get(f) ?? parseImports(f)) {
      if (staticOnly && imp.dynamic) continue
      const pkg = pkgName(imp.spec)
      if (pkg) { packages.add(pkg); continue }
      const target = resolveLocal(f, imp.spec)
      if (target && !(skipTests && isTest(target))) stack.push(target)
    }
  }
  return { files: seen, packages }
}

// --- the guards -------------------------------------------------------------

describe('no orphan source files', () => {
  it('every file under src/ is reached from a page, the middleware or a config — not only from its own test', () => {
    const reached = closure(ENTRIES).files
    const orphans = SRC
      .filter((f) => !isTest(f) && !reached.has(f))
      .map(rel)
    expect(orphans, 'Nothing imports these files. Delete them (and their tests), or import them where they are meant to be used.').toEqual([])
  })
})

describe('no dead exports', () => {
  // Hooks that exist only so tests can reset module state.
  const TEST_HOOK = /^_|ForTests$/

  it('every named export is used somewhere outside tests, or inside its own file', () => {
    const modules = [...closure(ENTRIES).files].filter((f) =>
      /\.(jsx?|mjs)$/.test(f) && !rel(f).startsWith('src/pages/') && rel(f).startsWith('src/') && !ENTRIES.includes(f))

    // name -> set of files that import it by name; '*' means every export.
    const importedBy = new Map()
    for (const [file, imps] of IMPORTS) {
      if (isTest(file)) continue
      for (const imp of imps) {
        const target = resolveLocal(file, imp.spec)
        if (!target) continue
        const names = importedBy.get(target) ?? new Set()
        if (imp.dynamic || /\*/.test(imp.clause)) names.add('*')
        const braces = imp.clause.match(/\{([\s\S]*)\}/)
        if (braces) for (const part of braces[1].split(',')) {
          const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
          if (name) names.add(name)
        }
        importedBy.set(target, names)
      }
    }

    const dead = []
    for (const file of modules) {
      const text = stripComments(read(file))
      const names = new Set()
      for (const m of text.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
      for (const m of text.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop().trim()
          if (name && name !== 'default') names.add(name)
        }
      }
      const users = importedBy.get(file) ?? new Set()
      for (const name of names) {
        if (TEST_HOOK.test(name) || users.has('*') || users.has(name)) continue
        const uses = text.match(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))?.length ?? 0
        if (uses > 1) continue // used inside its own file; exported for tests
        dead.push(`${rel(file)}: ${name}`)
      }
    }
    expect(dead, 'These exports have no caller. Delete them (and their tests).').toEqual([])
  })
})

describe('every dependency is used', () => {
  const pkg = JSON.parse(read(join(ROOT, 'package.json')))
  const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]

  // Packages that are needed but never named in an import.
  const IMPLICIT = {
    '@tiptap/pm': 'required peer of @tiptap/react and @tiptap/starter-kit',
    jsdom: 'vitest environment, named as a string in vitest.config.js',
    vite: 'pinned so npm cannot downgrade it (see package.json overrides)',
  }

  it('every package in package.json is imported by the site, its tests or its config', () => {
    const files = [
      ...SRC,
      ...CONFIGS,
      ...walk(join(ROOT, 'tests')).filter((f) => CODE.test(f)),
      ...walk(join(ROOT, 'scripts')).filter((f) => CODE.test(f)),
    ]
    const used = new Set()
    for (const f of files) for (const imp of IMPORTS.get(f) ?? parseImports(f)) {
      const name = pkgName(imp.spec)
      if (name) used.add(name)
    }
    const unused = declared.filter((d) => !used.has(d) && !IMPLICIT[d])
    expect(unused, 'Nothing imports these packages. Remove them with `npm uninstall <name>`.').toEqual([])
  })
})

describe('reader pages stay light', () => {
  // Pages where members write long text: the full editors belong here.
  const WRITER_PAGES = [
    'src/pages/library/publish.astro',
    'src/pages/library/edit/[id].astro',
    'src/pages/forum/new.astro',
  ]
  // Heavy code that must only arrive through a lazy import on every other page.
  const HEAVY_FILES = ['src/components/MarkdownEditor.jsx', 'src/components/RitualEditor.jsx']
  const HEAVY_PACKAGES = /^(mammoth|turndown|@tiptap\/)/

  it('no page outside the writer pages loads an editor or file importer up front', () => {
    const problems = []
    for (const page of SRC.filter((f) => rel(f).startsWith('src/pages/') && !WRITER_PAGES.includes(rel(f)))) {
      const { files, packages } = closure([page], { staticOnly: true })
      for (const f of files) if (HEAVY_FILES.includes(rel(f))) problems.push(`${rel(page)} -> ${rel(f)}`)
      for (const p of packages) if (HEAVY_PACKAGES.test(p)) problems.push(`${rel(page)} -> ${p}`)
    }
    expect(problems, 'Load these with React.lazy (see src/components/LazyMarkdownEditor.jsx) so readers do not download them.').toEqual([])
  })
})

describe('public assets', () => {
  const PUBLIC = join(ROOT, 'public')
  const files = walk(PUBLIC)
  // Served by convention: browsers and crawlers ask for these by name.
  const CONVENTION = new Set(['_headers', 'robots.txt', 'favicon.ico'])

  it('no two files in public/ have the same bytes', () => {
    const byHash = new Map()
    for (const f of files) {
      const h = createHash('sha256').update(readFileSync(f)).digest('hex')
      byHash.set(h, [...(byHash.get(h) ?? []), rel(f)])
    }
    const dupes = [...byHash.values()].filter((list) => list.length > 1)
    expect(dupes, 'Identical files make browsers download the same bytes twice. Keep one and point every reference at it.').toEqual([])
  })

  it('every file in public/ is referenced', () => {
    const haystack = [...SRC, ...CONFIGS, join(PUBLIC, '_headers')].filter(existsSync).map(read).join('\n')
    const unused = files
      .map((f) => rel(f).replace(/^public\//, ''))
      .filter((p) => !CONVENTION.has(p) && !haystack.includes(`/${p}`))
    expect(unused, 'Nothing links to these files. Delete them.').toEqual([])
  })
})

describe('scripts', () => {
  // Rehearsal tests are run by hand with scripts/sql/rehearse.ps1 -Test <file>.
  const BY_CONVENTION = /^scripts\/sql\/test-[\w-]+\.sql$/

  it('every script is documented or called from somewhere', () => {
    const docs = [
      join(ROOT, 'CLAUDE.md'),
      join(ROOT, 'package.json'),
      ...walk(join(ROOT, 'docs')),
      ...walk(join(ROOT, '.github')),
      ...walk(join(ROOT, 'scripts')),
    ].filter(existsSync)
    const scripts = walk(join(ROOT, 'scripts')).map(rel)
    const unreferenced = scripts.filter((s) => {
      if (BY_CONVENTION.test(s)) return false
      const name = basename(s)
      return !docs.some((d) => rel(d) !== s && read(d).includes(name))
    })
    expect(unreferenced, 'No doc, script or package.json mentions these. Delete one-offs once they have done their job, or document how to run them.').toEqual([])
  })
})

