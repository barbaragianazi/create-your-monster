import { CONDENSATION_LIMITS, type CondensationConfig } from './canCondensation'
import SliderRow from './SliderRow'

const SLIDERS = [
  { key: 'amount', label: 'Quantidade', min: 0, max: 1, step: 0.01, format: (v: number) => `${Math.round(v * 100)}%` },
  {
    key: 'size',
    label: 'Tamanho',
    min: CONDENSATION_LIMITS.size.min,
    max: CONDENSATION_LIMITS.size.max,
    step: 0.05,
    format: (v: number) => `${v.toFixed(2)}×`,
  },
  { key: 'intensity', label: 'Intensidade', min: 0, max: 1, step: 0.01, format: (v: number) => v.toFixed(2) },
] as const

// Controles de uma seção do painel de edição (o cabeçalho e o acordeão ficam no EditorPanel)
export default function CondensationDevControls({
  condensation,
  onChange,
}: {
  condensation: CondensationConfig
  onChange: (condensation: CondensationConfig) => void
}) {
  const update = (patch: Partial<CondensationConfig>) => onChange({ ...condensation, ...patch })

  return (
    <div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={condensation.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          Ativar condensação
        </label>

        {SLIDERS.map(({ key, label, min, max, step, format }) => (
          <SliderRow
            key={key}
            label={label}
            min={min}
            max={max}
            step={step}
            value={condensation[key]}
            format={format}
            disabled={!condensation.enabled}
            onChange={(next) => update({ [key]: next })}
          />
        ))}
      </div>
    </div>
  )
}
