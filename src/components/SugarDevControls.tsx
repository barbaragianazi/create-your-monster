import { SUGAR_LABEL_OPTIONS, type SugarConfig, type SugarLabel } from './canSugarLabel'
import type { TextElementConfig, TextsConfig } from './canText'
import { TextElementSection } from './TextDevControls'

const SLIDERS = [
  { key: 'scale', label: 'Escala', min: 0.5, max: 3 },
  { key: 'x', label: 'Posição X', min: -2.6, max: 2.6 },
  { key: 'y', label: 'Posição Y', min: -1.6, max: 2 },
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

  return (
    <div>
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Tipo de açúcar" className="flex gap-2">
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
            <p className="text-xs text-neutral-600">Selo oficial preto e branco: só posição e escala.</p>
            {SLIDERS.map(({ key, label, min, max }) => (
              <label key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
                {label}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.01}
                  value={sugar.highSugar[key]}
                  onChange={(e) =>
                    onSugarChange({ ...sugar, highSugar: { ...sugar.highSugar, [key]: Number(e.target.value) } })
                  }
                />
                <span className="text-right tabular-nums">{sugar.highSugar[key].toFixed(2)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
