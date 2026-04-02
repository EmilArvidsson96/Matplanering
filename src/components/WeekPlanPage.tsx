import { useState } from 'react'
import PortionsStep from './steps/PortionsStep'
import BrainstormStep from './steps/BrainstormStep'
import ScheduleStep from './steps/ScheduleStep'

type Step = 'portioner' | 'brainstorm' | 'schema'

const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: 'portioner',  label: 'Portioner',    icon: '👥' },
  { id: 'brainstorm', label: 'Brainstorm',   icon: '💡' },
  { id: 'schema',     label: 'Schema',       icon: '📋' },
]

export default function WeekPlanPage() {
  const [step, setStep] = useState<Step>('brainstorm')

  return (
    <div className="space-y-4">
      {/* Step tabs */}
      <div className="flex bg-white rounded-2xl shadow-sm p-1 gap-1">
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium transition-colors
              ${step === s.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-50'
              }`}
          >
            <span>{s.icon}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      {step === 'portioner'  && <PortionsStep />}
      {step === 'brainstorm' && <BrainstormStep />}
      {step === 'schema'     && <ScheduleStep />}
    </div>
  )
}
