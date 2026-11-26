/** Types for the parts of worker.js that vite.config.ts reuses in dev. */
export function handleIca(url: URL): Promise<{ status: number; body: unknown }>
declare const worker: { fetch(request: Request): Promise<Response> }
export default worker
