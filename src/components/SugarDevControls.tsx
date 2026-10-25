import { SUGAR_LABEL_OPTIONS, type SugarConfig, type SugarLabel } from './canSugarLabel'
import type { TextElementConfig, TextsConfig } from './canText'
import { TextElementSection } from './TextDevControls'
import AdvancedAdjust from './AdvancedAdjust'
import SliderRow from './SliderRow'

const SLIDERS = [
  { key: 'scale', label: 'Tamanho', min: 0.5, max: 3 },
  { key: 'x', label: 'Horizontal', min: -2.6, max: 2.6 },
  { key: 'y', label: 'Vertical', min: -1.6, max: 2 },
] as const

// Controles de uma seção do painel de edição (o cabeçalho e o acordeão ficam no EditorPanel)
export default function SugarDevControls({
  sugar,
  onSugarChange,
  texts,
  onTextsChange,
}: {
  sugar: SugarConfig
  onSugarChange: (sugar: SugarConfig) => void
  texts: TextsConfig
  onTextsChange: (texts: TextsConfig) => void
}) {
  // Trocar de tipo só troca `type`: as configurações do Zero Sugar e do selo continuam guardadas
  const selectType = (type: SugarLabel) => onSugarChange({ ...sugar, type })

  const updateZeroSugar = (patch: Partial<TextElementConfig>) =>
    onTextsChange({ ...texts, zeroSugar: { ...texts.zeroSugar, ...patch } })

  const renderSlider = ({ key, label, min, max }: (typeof SLIDERS)[number]) => (
    <SliderRow
      key={key}
      label={label}
      min={min}
      max={max}
      value={sugar.highSugar[key]}
      onChange={(next) => onSugarChange({ ...sugar, highSugar: { ...sugar.highSugar, [key]: next } })}
    />
  )

  return (
    <div>
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Selo de açúcar" className="flex gap-2">
          {SUGAR_LABEL_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectType(id)}
              aria-pressed={sugar.type === id}
              className={`flex-1 rounded border px-1 py-2 text-xs ${
                sugar.type === id ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sugar.type === 'zero' && (
          <TextElementSection id="zeroSugar" config={texts.zeroSugar} onChange={updateZeroSugar} showVisibility={false} />
        )}

        {sugar.type === 'high-sugar' && (
          <div className="flex flex-col gap-2">
            {SLIDERS.filter(({ key }) => key === 'scale').map(renderSlider)}
            <AdvancedAdjust>{SLIDERS.filter(({ key }) => key !== 'scale').map(renderSlider)}</AdvancedAdjust>
          </div>
        )}
      </div>
    </div>
  )
}
