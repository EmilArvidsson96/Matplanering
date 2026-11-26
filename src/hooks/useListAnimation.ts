/**
 * Smooth list changes: a removed row fades out while the rows below slide up
 * into its place (FLIP), and new rows fade in. Only transform and opacity are
 * animated, so the browser runs it on the compositor at the display's
 * refresh rate (120 Hz on ProMotion phones) without layout work per frame.
 *
 * Usage: `const list = useListAnimation()` and `<div ref={list}>` on the
 * element whose direct children come and go.
 */
import { useAutoAnimate } from '@formkit/auto-animate/react'
import type { AutoAnimationPlugin } from '@formkit/auto-animate'

/** Same curve as the app's sheets: quick start, long soft landing. */
const EASE_OUT = 'cubic-bezier(0.32, 0.72, 0, 1)'
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// auto-animate calls plugins as (el, action, oldCoords, newCoords), whatever its .d.ts names them.
const plugin: AutoAnimationPlugin = (el, action, prev, next) => {
  if (reduceMotion()) return new KeyframeEffect(el, [], { duration: 0 })

  if (action === 'add') {
    return new KeyframeEffect(el, [
      { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: 320, easing: EASE_OUT })
  }

  if (action === 'remove') {
    return new KeyframeEffect(el, [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.96)' },
    ], { duration: 180, easing: EASE_IN })
  }

  // remain: slide from where it was to where it is now.
  const dx = prev && next ? prev.left - next.left : 0
  const dy = prev && next ? prev.top - next.top : 0
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return new KeyframeEffect(el, [], { duration: 0 })
  return new KeyframeEffect(el, [
    { transform: `translate(${dx}px, ${dy}px)` },
    { transform: 'translate(0, 0)' },
  ], { duration: 380, easing: EASE_OUT })
}

export function useListAnimation<T extends Element = HTMLDivElement>() {
  const [ref] = useAutoAnimate<T>(plugin)
  return ref
}
