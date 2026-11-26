/**
 * Fetching pages that send no CORS headers (recipe sites, Bing).
 * Production goes through the recipe-proxy Cloudflare Worker, which only
 * answers the GitHub Pages origin; dev goes through the same-origin
 * `/__proxy` middleware in vite.config.ts.
 */

const PROD_PROXY = 'https://matplanering-recipe-proxy.emil-arvidsson.workers.dev/?url='

export function proxiedUrl(url: string): string {
  return (import.meta.env.DEV ? '/__proxy?url=' : PROD_PROXY) + encodeURIComponent(url)
}
