import { useEffect, useState } from 'react'
import type { Dish } from '../../types'
import { dishImageUrl } from '../../utils/dishImage'

/**
 * The dish's picture (own choice, else the automatic one). Renders `fallback`
 * when there is none or it fails to load.
 */
export default function DishImage({ dish, className, fallback = null, alt = '' }: {
  dish: Dish
  className?: string
  fallback?: React.ReactNode
  alt?: string
}) {
  const url = dishImageUrl(dish)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (!url || failed) return <>{fallback}</>
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
