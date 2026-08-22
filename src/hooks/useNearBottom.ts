import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const BOTTOM_THRESHOLD_PX = 48

/** True when the app's scrollable <main> is scrolled (near) to its bottom. */
export function useNearBottom(): boolean {
  const [nearBottom, setNearBottom] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let raf = 0
    function measure() {
      const main = document.querySelector('main')
      if (!main) { setNearBottom(false); return }
      const distance = main.scrollHeight - main.scrollTop - main.clientHeight
      setNearBottom(distance < BOTTOM_THRESHOLD_PX)
    }
    function scheduleMeasure() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    scheduleMeasure()

    function onScroll(e: Event) {
      if ((e.target as HTMLElement | null)?.tagName === 'MAIN') measure()
    }
    // Capture phase: scroll events on inner elements don't bubble to document.
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)

    // Content can grow/shrink (items added, data loaded) without a scroll
    // event ever firing — re-measure whenever the page content changes.
    const main = document.querySelector('main')
    const mutationObserver = main ? new MutationObserver(scheduleMeasure) : null
    mutationObserver?.observe(main!, { childList: true, subtree: true, characterData: true })

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
      mutationObserver?.disconnect()
    }
  }, [location.pathname])

  return nearBottom
}
