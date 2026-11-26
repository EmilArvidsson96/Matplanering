import type { Dish, DishAutoImage } from '../types'
import { proxiedUrl } from '../api/proxy'

// Picks a photo for a dish the user hasn't chosen one for.
//
//   1. Linked recipe page: schema.org Recipe image → og:image (unless it looks
//      like a logo/site banner) → an in-page image whose file name matches the
//      recipe. Small WordPress thumbnails are upgraded to the full-size file.
//   2. Page can't be fetched (ica.se blocks servers): Bing image search on that
//      site, keeping only hits whose source page *is* the linked recipe.
//   3. Otherwise: Bing image search for "<name> recept", hits scored on how
//      many words of the name appear in the hit's title/URL, recipe sites,
//      photo size/shape, minus stock/social sites and listing pages.
//
// Every candidate is loaded in the browser before it's accepted (must load,
// be big enough and roughly landscape/square), so dead or hotlink-blocked
// links fall through to the next one.

export interface ImageCandidate {
  url: string
  /** Bing-hosted copy, used when the original won't load. */
  fallback?: string
  source: 'recipe' | 'search'
  pageUrl?: string
}

export interface ImagePick {
  url: string
  source: 'recipe' | 'search'
  pageUrl?: string
  alternatives: string[]
}

/** What the current auto image was found for; a change means search again. */
export function autoImageKey(dish: Pick<Dish, 'name' | 'recipeUrl'>): string {
  return `${dish.name.trim().toLowerCase()}|${dish.recipeUrl.trim()}`
}

/** The picture to show: the user's own, else the automatic one. */
export function dishImageUrl(dish: Dish): string | undefined {
  return dish.imageUrl?.trim() || dish.autoImage?.url || undefined
}

const RETRY_AFTER_DAYS = 14

/** True when the background job should look for (another) picture. */
export function needsAutoImage(dish: Dish, today = new Date()): boolean {
  if (dish.imageUrl?.trim() || !dish.name.trim()) return false
  const a = dish.autoImage
  if (!a || a.key !== autoImageKey(dish)) return true
  if (a.url) return false
  const age = (today.getTime() - new Date(a.at).getTime()) / 86400000
  return !(age < RETRY_AFTER_DAYS)
}

// ── Text matching ─────────────────────────────────────────────────────────────

const STOP = new Set([
  'med', 'och', 'i', 'pa', 'a', 'la', 'al', 'alla', 'con', 'di', 'de', 'the', 'with', 'and',
  'recept', 'recipe', 'en', 'ett', 'till', 'samt', 'eller', 'utan', 'www', 'https', 'http', 'se', 'com',
])

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function words(s: string): string[] {
  return (fold(s).match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 1 && !STOP.has(t))
}

/** Share of the name's words found in `text` (prefix match handles "gryta" ~ "grytan", compounds). */
export function wordCoverage(name: string, text: string): number {
  const want = words(name)
  if (want.length === 0) return 0
  const have = words(text)
  const hit = want.filter(w => have.some(h => h.startsWith(w) || (h.length > 4 && w.startsWith(h)))).length
  return hit / want.length
}

// ── Linked recipe page ────────────────────────────────────────────────────────

const GENERIC_IMAGE = /logo|favicon|icon|avatar|placeholder|default[-_.]|cropped-|sprite|vinjett|banner|share[-_]?image|\.svg(\?|$)|\.gif(\?|$)/i

function imagesFrom(v: unknown): string[] {
  if (!v) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(imagesFrom)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return imagesFrom(o.url ?? o.contentUrl)
  }
  return []
}

function findRecipe(o: unknown): Record<string, unknown> | null {
  if (Array.isArray(o)) {
    for (const x of o) { const r = findRecipe(x); if (r) return r }
    return null
  }
  if (o && typeof o === 'object') {
    const obj = o as Record<string, unknown>
    const t = obj['@type']
    if ((Array.isArray(t) ? t : [t]).includes('Recipe')) return obj
    for (const k of ['@graph', 'mainEntity']) {
      const r = findRecipe(obj[k])
      if (r) return r
    }
  }
  return null
}

function meta(doc: Document, key: string): string | undefined {
  const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
  return el?.getAttribute('content')?.trim() || undefined
}

/** Largest source an <img> offers (lazy-load attributes, srcset). */
function imgSource(img: Element): string | undefined {
  const orig = img.getAttribute('data-orig-file') || img.getAttribute('data-large-file')
  if (orig) return orig
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset')
  if (srcset) {
    const best = srcset.split(',')
      .map(p => p.trim().split(/\s+/))
      .map(([u, w]) => ({ u, w: parseInt(w) || 0 }))
      .sort((a, b) => b.w - a.w)[0]
    if (best?.u) return best.u
  }
  return img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || undefined
}

/** "foo-300x300.jpg" → "foo.jpg" (WordPress resized copy → original), when small. */
function fullSizeVariant(url: string): string | null {
  const m = url.match(/^(.*)-(\d{2,4})x(\d{2,4})(\.(?:jpe?g|png|webp))(\?.*)?$/i)
  if (!m || Math.max(+m[2], +m[3]) >= 700) return null
  return m[1] + m[4] + (m[5] ?? '')
}

function absolute(u: string, base: string): string | null {
  try {
    const url = new URL(u.replace(/&amp;/g, '&'), base)
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}

export function recipePageImages(html: string, pageUrl: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const slug = new URL(pageUrl).pathname
  const title = meta(doc, 'og:title') ?? doc.title ?? ''

  const ld: string[] = []
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const r = findRecipe(JSON.parse(s.textContent ?? ''))
      if (r) ld.push(...imagesFrom(r.image))
    } catch { /* malformed JSON-LD */ }
  })

  const og = [meta(doc, 'og:image'), meta(doc, 'og:image:secure_url'), meta(doc, 'twitter:image')]
    .filter((u): u is string => !!u && !GENERIC_IMAGE.test(u))

  // In-page photos whose file name shares words with the recipe — catches
  // sites whose og:image is the same banner on every page.
  const content: string[] = []
  doc.querySelectorAll('article img, main img, .entry-content img, .post-content img, .recipe img, img.wp-post-image')
    .forEach(img => {
      const u = imgSource(img)
      if (!u || GENERIC_IMAGE.test(u) || u.startsWith('data:')) return
      const file = decodeURIComponent(u.split('?')[0].split('/').pop() ?? '')
      if (wordCoverage(file, slug + ' ' + title) >= 0.5 || wordCoverage(slug, file) >= 0.5) content.push(u)
    })

  const out: string[] = []
  for (const raw of [...ld, ...og, ...content.slice(0, 4)]) {
    const u = absolute(raw, pageUrl)
    if (!u) continue
    const big = fullSizeVariant(u)
    if (big) out.push(big)
    out.push(u)
  }
  return [...new Set(out)]
}

// ── Bing image search ─────────────────────────────────────────────────────────

interface BingHit {
  murl: string   // the image
  turl: string   // Bing thumbnail
  purl: string   // page it's on
  t: string      // page title
  w: number
  h: number
}

async function bingImages(query: string): Promise<BingHit[]> {
  const url = 'https://www.bing.com/images/search?' + new URLSearchParams({
    q: query, qft: '+filterui:photo-photo', form: 'IRFLTR', first: '1',
  })
  const res = await fetch(proxiedUrl(url))
  if (!res.ok) throw new Error(`Bildsökningen svarade ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const hits: BingHit[] = []
  doc.querySelectorAll('a.iusc[m]').forEach(a => {
    try {
      const m = JSON.parse(a.getAttribute('m') ?? '')
      if (!m.murl) return
      const dims = a.closest('.imgpt')?.querySelector('.img_info .nowrap')?.textContent ?? ''
      const d = dims.match(/(\d+)\s*[×x]\s*(\d+)/)
      hits.push({ murl: m.murl, turl: m.turl ?? '', purl: m.purl ?? '', t: m.t ?? '', w: d ? +d[1] : 0, h: d ? +d[2] : 0 })
    } catch { /* skip odd entries */ }
  })
  return hits
}

/** Large Bing-hosted copy of a hit (cropped 3:2) — loads even when the site blocks hotlinking. */
function bingCopy(turl: string): string | undefined {
  const id = turl.match(/[?&]id=([^&]+)/)?.[1]
  return id ? `https://th.bing.com/th/id/${id}?w=960&h=640&c=7&rs=1&pid=1.7` : undefined
}

const AVOID_SITES = /pinterest|pinimg|youtube|ytimg|facebook|fbcdn|instagram|tiktok|reddit|redd\.it|shutterstock|alamy|dreamstime|istockphoto|gettyimages|depositphotos|123rf|stock\.adobe|freepik|vecteezy|amazon\.|ebay\.|etsy\.|aliexpress|wikipedia|wikimedia/i
const RECIPE_SITES = /koket\.se|ica\.se|arla\.se|tasteline|mathem\.se|coop\.se|recept\.se|godare\.se|zeinaskitchen|tillmiddag|alltommat|mykitchenstories|landleyskok|elinaomickesmat|svtstatic|allrecipes|bbcgoodfood|seriouseats|recipetineats/i
const LISTING_PAGE = /\/(tag|tags|kategori|category|categories|artikel|samling|search|sok)\/|topplista|\d+-basta|basta-recept/i

function scoreHit(name: string, h: BingHit, rank: number): { score: number; coverage: number } {
  const page = decodeURIComponent(h.purl)
  const coverage = wordCoverage(name, `${h.t} ${page}`)
  let score = coverage * 5 - rank * 0.15
  const where = `${h.purl} ${h.murl}`
  if (AVOID_SITES.test(where)) score -= 4
  if (RECIPE_SITES.test(where)) score += 1.5
  if (/\/(recept|recipes?)\//i.test(h.purl)) score += 1
  if (/\.se\//.test(h.purl)) score += 0.5
  if (LISTING_PAGE.test(fold(page)) || /\b(basta|test|tips)\b/.test(fold(h.t))) score -= 2
  if (h.w && h.h) {
    const ar = h.w / h.h
    if (h.w < 500 || h.h < 350) score -= 2
    if (ar >= 1.1 && ar <= 1.9) score += 0.7
    else if (ar < 0.8 || ar > 2.2) score -= 1.5
  }
  return { score, coverage }
}

function normPage(u: string): string {
  try {
    const x = new URL(u)
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase()
  } catch { return u }
}

/** The linked recipe's own photo as indexed by Bing (for sites that block fetching). */
async function bingRecipePageImages(recipeUrl: string, name: string): Promise<ImageCandidate[]> {
  const u = new URL(recipeUrl)
  const slugWords = decodeURIComponent(u.pathname).split('/').filter(Boolean).pop()
    ?.replace(/-\d+$/, '').replace(/[-_]+/g, ' ') ?? ''
  const query = `${slugWords || name} site:${u.hostname.replace(/^www\./, '')}`
  const want = normPage(recipeUrl)
  return (await bingImages(query))
    .filter(h => normPage(h.purl) === want && h.murl.startsWith('https://'))
    .map(h => ({ url: h.murl, fallback: bingCopy(h.turl), source: 'recipe' as const, pageUrl: recipeUrl }))
}

async function searchImages(name: string): Promise<ImageCandidate[]> {
  const hits = (await bingImages(`${name} recept`)).slice(0, 20)
  return hits
    .map((h, i) => ({ h, ...scoreHit(name, h, i) }))
    .filter(x => x.coverage >= 0.5 && x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map(({ h }) => ({
      url: h.murl.startsWith('https://') ? h.murl : (bingCopy(h.turl) ?? ''),
      fallback: bingCopy(h.turl),
      source: 'search' as const,
      pageUrl: h.purl,
    }))
    .filter(c => c.url)
}

// ── Verification ──────────────────────────────────────────────────────────────

/** Loads the image like the app will show it; resolves with its size or null. */
export function probeImage(url: string, timeoutMs = 8000): Promise<{ w: number; h: number } | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    const timer = setTimeout(() => { img.src = ''; resolve(null) }, timeoutMs)
    img.onload = () => { clearTimeout(timer); resolve({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

async function usable(url: string): Promise<boolean> {
  const size = await probeImage(url)
  if (!size) return false
  const ar = size.w / size.h
  return size.w >= 280 && size.h >= 200 && ar >= 0.6 && ar <= 2.4
}

/** First candidate (or its Bing copy) that actually loads and looks like a photo. */
async function firstUsable(c: ImageCandidate): Promise<string | null> {
  if (await usable(c.url)) return c.url
  if (c.fallback && c.fallback !== c.url && await usable(c.fallback)) return c.fallback
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function findImageCandidates(dish: Pick<Dish, 'name' | 'recipeUrl'>): Promise<ImageCandidate[]> {
  const out: ImageCandidate[] = []
  const link = dish.recipeUrl.trim()
  if (link) {
    let pageUrl: string | null = null
    try { pageUrl = new URL(link.replace(/^http:/, 'https:')).toString() } catch { /* bad link */ }
    if (pageUrl) {
      try {
        const res = await fetch(proxiedUrl(pageUrl))
        if (res.ok) {
          out.push(...recipePageImages(await res.text(), pageUrl)
            .map(url => ({ url, source: 'recipe' as const, pageUrl: pageUrl! })))
        }
      } catch { /* fall through to search */ }
      if (out.length === 0) {
        try { out.push(...await bingRecipePageImages(pageUrl, dish.name)) } catch { /* ignore */ }
      }
    }
  }
  try { out.push(...await searchImages(dish.name)) } catch (e) { if (out.length === 0) throw e }
  const seen = new Set<string>()
  return out.filter(c => !seen.has(c.url) && seen.add(c.url))
}

/** Finds the best working picture plus a few working alternatives. */
export async function pickDishImage(dish: Pick<Dish, 'name' | 'recipeUrl'>, maxAlternatives = 5): Promise<ImagePick | null> {
  const candidates = await findImageCandidates(dish)
  let chosen: { url: string; c: ImageCandidate } | null = null
  const alternatives: string[] = []
  // Check a few at a time; keep the ranking order.
  for (let i = 0; i < candidates.length && alternatives.length < maxAlternatives; i += 3) {
    const batch = candidates.slice(i, i + 3)
    const ok = await Promise.all(batch.map(firstUsable))
    batch.forEach((c, j) => {
      const url = ok[j]
      if (!url) return
      if (!chosen) chosen = { url, c }
      else if (url !== chosen.url && !alternatives.includes(url) && alternatives.length < maxAlternatives) alternatives.push(url)
    })
    // Once we have a recipe-page photo we only need a few alternatives.
    if (chosen && i >= 9) break
  }
  if (!chosen) return null
  const { url, c } = chosen as { url: string; c: ImageCandidate }
  return { url, source: c.source, pageUrl: c.pageUrl, alternatives }
}

export function toAutoImage(dish: Pick<Dish, 'name' | 'recipeUrl'>, pick: ImagePick | null): DishAutoImage {
  const base = { key: autoImageKey(dish), at: new Date().toISOString() }
  if (!pick) return { url: '', ...base }
  return { url: pick.url, source: pick.source, pageUrl: pick.pageUrl, alternatives: pick.alternatives, ...base }
}
