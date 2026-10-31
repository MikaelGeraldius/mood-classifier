// Downloads the three web fonts from Fontshare into public/fonts/ before a build.
// The repository is public and the ITF Free Font License forbids sharing the files through one, so they are not
// committed (see FONTS.md). The deployed site still serves them itself, which the licence allows.
// Files already present are left alone, so local builds do not need the network.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const dir = new URL('../public/fonts/', import.meta.url)

// SHA-256 of the files as first retrieved (FONTS.md). A mismatch means Fontshare has updated a font: the build
// goes on with the new file, and the warning says so.
const fonts = [
  { family: 'Gambarino', weight: '400', file: 'Gambarino-Regular.woff2', sha: '73b51a4e355f266dd9b17b78fe36a5ac66606d2093b03ead2f58b75207c4be70' },
  { family: 'General Sans', weight: '400', file: 'GeneralSans-Regular.woff2', sha: '3ec2be771caf168b077ca05af4df1dace77088e2b3a27da570036e61be58a039' },
  { family: 'General Sans', weight: '500', file: 'GeneralSans-Medium.woff2', sha: 'c30377df1de8444d07161725c751f458beec07c28034df2fd275d1aa587a239f' },
]

const missing = fonts.filter((f) => !existsSync(new URL(f.file, dir)))
if (missing.length === 0) {
  console.log('fonts: all present')
  process.exit(0)
}

let css
try {
  css = await fetch('https://api.fontshare.com/v2/css?f[]=gambarino@400&f[]=general-sans@400,500').then((r) => {
  if (!r.ok) throw new Error(`Fontshare CSS: HTTP ${r.status}`)
  return r.text()
})
} catch (error) {
  // Offline or blocked: build anyway; the CSS falls back to Iowan/Palatino/Georgia and the system sans.
  console.warn(`fonts: could not reach Fontshare (${error.cause?.code ?? error.message}); building with fallback fonts`)
  process.exit(0)
}
// One @font-face block per family and weight; take its woff2 source.
const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  family: body.match(/font-family:\s*'([^']+)'/)?.[1],
  weight: body.match(/font-weight:\s*(\d+)/)?.[1],
  url: body.match(/url\('([^']+\.woff2)'\)/)?.[1],
}))

mkdirSync(dir, { recursive: true })
for (const font of missing) {
  const face = faces.find((f) => f.family === font.family && f.weight === font.weight)
  if (!face?.url) throw new Error(`Fontshare CSS has no woff2 for ${font.family} ${font.weight}`)
  // The CSS gives protocol-relative URLs (//cdn.fontshare.com/...).
  const res = await fetch(new URL(face.url, 'https://api.fontshare.com/'))
  if (!res.ok) throw new Error(`${font.file}: HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  const sha = createHash('sha256').update(data).digest('hex')
  if (sha !== font.sha) console.warn(`fonts: ${font.file} differs from the recorded version (Fontshare update?)`)
  writeFileSync(new URL(font.file, dir), data)
  console.log(`fonts: fetched ${font.file} (${data.length} bytes)`)
}
