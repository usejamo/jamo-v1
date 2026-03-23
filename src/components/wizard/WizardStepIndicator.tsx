interface WizardStepIndicatorProps {
  steps: readonly string[]
  currentStep: number
  onStepClick: (index: number) => void
}

export function WizardStepIndicator({ steps, currentStep, onStepClick }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 px-6 pt-5 pb-4 border-b border-gray-100">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-0">
          <button
            type="button"
            onClick={() => { if (i < currentStep) onStepClick(i) }}
            disabled={i >= currentStep}
            className={[
              'flex flex-col items-center gap-1 px-3',
              i < currentStep ? 'cursor-pointer' : 'cursor-default',
            ].join(' ')}
          >
            <span className={[
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
              i === currentStep ? 'bg-jamo-500 text-white' :
              i < currentStep ? 'bg-jamo-100 text-jamo-600' :
              'bg-gray-100 text-gray-400'
            ].join(' ')}>
              {i + 1}
            </span>
            <span className="text-xs text-gray-500">{label}</span>
          </button>
          {i < steps.length - 1 && (
            <div className={['h-px w-8 mt-[-1rem]', i < currentStep ? 'bg-jamo-200' : 'bg-gray-200'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  )
}
