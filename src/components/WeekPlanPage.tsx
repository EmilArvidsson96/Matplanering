import { useState } from 'react'
import { Users, Lightbulb, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import PortionsStep from './steps/PortionsStep'
import BrainstormStep from './steps/BrainstormStep'
import ScheduleStep from './steps/ScheduleStep'
import ErrorBoundary from './common/ErrorBoundary'

type Step = 'portioner' | 'brainstorm' | 'schema'

const STEPS: { id: Step; label: string; Icon: LucideIcon }[] = [
  { id: 'portioner',  label: 'Portioner',  Icon: Users },
  { id: 'brainstorm', label: 'Brainstorm', Icon: Lightbulb },
  { id: 'schema',     label: 'Schema',     Icon: CalendarDays },
]

export default function WeekPlanPage() {
  const [step, setStep] = useState<Step>('brainstorm')

  return (
    <div className="space-y-4">
      {/* Step tabs */}
      <div className="flex bg-white rounded-2xl border border-gray-200 p-1 gap-1">
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-colors
              ${step === s.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
              }`}
          >
            <s.Icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <ErrorBoundary key={step}>
        {step === 'portioner'  && <PortionsStep />}
        {step === 'brainstorm' && <BrainstormStep />}
        {step === 'schema'     && <ScheduleStep />}
      </ErrorBoundary>
    </div>
  )
}
