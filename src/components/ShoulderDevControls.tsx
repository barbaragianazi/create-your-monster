import type { CanShoulderConfig } from './canShoulder'

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
      <div className="flex items-center justify-between gap-4">
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
          <input type="color" aria-label="Cor do ombro" value={shoulder.color} onChange={(e) => onChange({ color: e.target.value })} />
        )}
      </div>
    </div>
  )
}
