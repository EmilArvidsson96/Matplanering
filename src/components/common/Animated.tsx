import type { HTMLAttributes, ReactNode } from 'react'
import { useListAnimation } from '../../hooks/useListAnimation'

/** A list whose children animate in, out and into their new places. */
export function AnimatedDiv({ children, ...rest }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  const ref = useListAnimation<HTMLDivElement>()
  return <div ref={ref} {...rest}>{children}</div>
}

export function AnimatedUl({ children, ...rest }: HTMLAttributes<HTMLUListElement> & { children?: ReactNode }) {
  const ref = useListAnimation<HTMLUListElement>()
  return <ul ref={ref} {...rest}>{children}</ul>
}

/**
 * Smooth open/close of a block (height from 0 to auto) by animating the grid
 * row from 0fr to 1fr. The content stays mounted.
 */
export function Collapse({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none
        ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      aria-hidden={!open}
      // React 18 has no boolean "inert" prop; an empty string sets the attribute.
      {...(!open ? { inert: '' } as Record<string, string> : {})}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  )
}
