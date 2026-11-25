import type { ReactNode } from 'react'

interface Option<T extends string> {
  id: T
  label: ReactNode
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel?: string
  size?: 'md' | 'lg'
}

/**
 * Pill-shaped tab switcher. The white "thumb" slides to the selected option
 * instead of jumping, which makes tab changes feel continuous.
 */
export default function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, size = 'md',
}: Props<T>) {
  const index = Math.max(0, options.findIndex(o => o.id === value))
  const n = options.length

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative rounded-full bg-line-soft p-1 grid ${size === 'lg' ? 'h-12' : 'h-11'}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {/* Sliding thumb */}
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-full bg-white shadow-sm motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          width: `calc((100% - 0.5rem) / ${n})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(o => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`relative z-10 flex items-center justify-center gap-2 rounded-full text-sm min-w-0 px-1 transition-colors duration-200
              ${active ? 'text-ink font-semibold' : 'text-ink-muted font-medium hover:text-ink'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
