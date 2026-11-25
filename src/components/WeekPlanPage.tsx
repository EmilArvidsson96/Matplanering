import { useSearchParams } from 'react-router-dom'
import { Users, Lightbulb, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import PortionsStep from './steps/PortionsStep'
import BrainstormStep from './steps/BrainstormStep'
import ScheduleStep from './steps/ScheduleStep'
import ErrorBoundary from './common/ErrorBoundary'
import SegmentedControl from './common/SegmentedControl'

type Step = 'portioner' | 'brainstorm' | 'schema'

const STEPS: { id: Step; label: string; Icon: LucideIcon }[] = [
  { id: 'portioner',  label: 'Portioner',  Icon: Users },
  { id: 'brainstorm', label: 'Brainstorm', Icon: Lightbulb },
  { id: 'schema',     label: 'Schema',     Icon: CalendarDays },
]

const VALID_STEPS = new Set<Step>(['portioner', 'brainstorm', 'schema'])

export default function WeekPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramStep = searchParams.get('steg') as Step | null
  // Step is always derived from the URL so navigate() calls update it immediately
  const step: Step = paramStep && VALID_STEPS.has(paramStep) ? paramStep : 'brainstorm'

  function setStep(s: Step) {
    setSearchParams({ steg: s }, { replace: true })
  }

  return (
    <div className="space-y-5">
      {/* Step tabs */}
      <SegmentedControl
        ariaLabel="Planeringssteg"
        size="lg"
        value={step}
        onChange={setStep}
        options={STEPS.map((s, i) => ({
          id: s.id,
          label: (
            <>
              <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 transition-colors
                ${step === s.id ? 'bg-ink text-white' : 'bg-line text-ink-muted'}`}>{i + 1}</span>
              <span className="truncate">{s.label}</span>
            </>
          ),
        }))}
      />

      {/* Step content */}
      <ErrorBoundary key={step}>
        <div className="motion-safe:animate-fade-up">
        {step === 'portioner'  && <PortionsStep />}
        {step === 'brainstorm' && <BrainstormStep />}
        {step === 'schema'     && <ScheduleStep />}
        </div>
      </ErrorBoundary>
    </div>
  )
}
