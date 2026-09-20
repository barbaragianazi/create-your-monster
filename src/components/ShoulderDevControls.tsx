import type { CanShoulderConfig, ShoulderFinish } from './canShoulder'

const FINISH_OPTIONS: { finish: ShoulderFinish; label: string }[] = [
  { finish: 'inherit', label: 'Mesmo da lata' },
  { finish: 'metallic', label: 'Metálico' },
  { finish: 'matte', label: 'Fosco' },
]

// Ferramenta temporária de calibração (não faz parte da UI final)
export default function ShoulderDevControls({
  shoulder,
  onChange,
}: {
  shoulder: CanShoulderConfig
  onChange: (patch: Partial<CanShoulderConfig>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={shoulder.inheritBodyColor}
          onChange={(e) => onChange({ inheritBodyColor: e.target.checked })}
        />
        Mesma cor da lata
      </label>

      {/* a cor independente fica guardada em `shoulder.color` mesmo enquanto o campo está oculto */}
      {!shoulder.inheritBodyColor && (
        <label className="flex items-center justify-between gap-4">
          Cor
          <input type="color" value={shoulder.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
      )}

      <div className="flex flex-col gap-1">
        <span>Acabamento</span>
        <div className="flex gap-1">
          {FINISH_OPTIONS.map(({ finish, label }) => (
            <button
              key={finish}
              type="button"
              onClick={() => onChange({ finish })}
              aria-pressed={shoulder.finish === finish}
              className={`flex-1 rounded border px-1 py-1 leading-tight ${
                shoulder.finish === finish ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
