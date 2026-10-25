import type { BodyFill, BodyFillType, BodyGradient } from './canBodyFill'
import SliderRow from './SliderRow'

const FILL_TYPES: { type: BodyFillType; label: string }[] = [
  { type: 'solid', label: 'Sólido' },
  { type: 'gradient', label: 'Degradê' },
]

// Ferramenta temporária de calibração (não faz parte da UI final)
export default function BodyFillDevControls({
  fill,
  onChange,
}: {
  fill: BodyFill
  onChange: (patch: Partial<BodyFill>) => void
}) {
  const { gradient } = fill
  const updateGradient = (patch: Partial<BodyGradient>) => onChange({ gradient: { ...gradient, ...patch } })

  return (
    <div className="flex flex-col gap-2">
      {/* no toque: linha 1 = cor, linha 2 = tipo de preenchimento (o rótulo "Preenchimento" some, os botões já dizem) */}
      <div className="flex flex-col gap-2 pointer-coarse:order-2">
        <span className="pointer-coarse:sr-only">Preenchimento</span>
        <div className="flex gap-2">
          {FILL_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ type })}
              aria-pressed={fill.type === type}
              className={`flex-1 rounded border px-2 py-2 ${
                fill.type === type ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {fill.type === 'solid' ? (
        <label className="flex items-center justify-between gap-4 pointer-coarse:order-1">
          Cor
          <input type="color" value={fill.solidColor} onChange={(e) => onChange({ solidColor: e.target.value })} />
        </label>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 pointer-coarse:order-1">
            <label className="flex items-center gap-2">
              Início
              <input
                type="color"
                value={gradient.startColor}
                onChange={(e) => updateGradient({ startColor: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2">
              Fim
              <input
                type="color"
                value={gradient.endColor}
                onChange={(e) => updateGradient({ endColor: e.target.value })}
              />
            </label>
          </div>
          <SliderRow
            label="Direção"
            min={0}
            max={360}
            step={1}
            value={gradient.angle}
            format={(v) => `${v}°`}
            onChange={(next) => updateGradient({ angle: next })}
          />
        </>
      )}
    </div>
  )
}
