import type { BodyFill, BodyFillType, BodyGradient } from './canBodyFill'

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
      <div className="flex flex-col gap-1">
        <span>Preenchimento</span>
        <div className="flex gap-1">
          {FILL_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ type })}
              aria-pressed={fill.type === type}
              className={`flex-1 rounded border px-2 py-1 ${
                fill.type === type ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {fill.type === 'solid' ? (
        <label className="flex items-center justify-between gap-4">
          Cor
          <input type="color" value={fill.solidColor} onChange={(e) => onChange({ solidColor: e.target.value })} />
        </label>
      ) : (
        <>
          <label className="flex items-center justify-between gap-4">
            Cor inicial
            <input
              type="color"
              value={gradient.startColor}
              onChange={(e) => updateGradient({ startColor: e.target.value })}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            Cor final
            <input
              type="color"
              value={gradient.endColor}
              onChange={(e) => updateGradient({ endColor: e.target.value })}
            />
          </label>
          <label className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
            Direção
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={gradient.angle}
              onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
            />
            <span className="text-right tabular-nums">{gradient.angle}°</span>
          </label>
        </>
      )}
    </div>
  )
}
