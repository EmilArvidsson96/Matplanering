import type { ReceiptImage } from '../api/anthropic'

const MAX_DIM = 1568  // Claude vision's optimal max edge — avoids wasting tokens on huge photos.

/** Read an image File, downscale to a sane size, and return base64 JPEG for the API. */
export async function fileToReceiptImage(file: File): Promise<ReceiptImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Kunde inte läsa bildfilen.'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Kunde inte tolka bilden.'))
    el.src = dataUrl
  })

  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas stöds inte i denna webbläsare.')
  ctx.drawImage(img, 0, 0, w, h)

  const jpeg = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: jpeg.split(',')[1] ?? '' }
}
