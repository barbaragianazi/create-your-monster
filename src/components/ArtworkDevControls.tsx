import {
  ARTWORK_LIMITS,
  type ArtworkConfig,
  type ArtworkElementConfig,
  type ArtworkElementId,
  type InnerEffect,
  type InnerEffectType,
} from './canArtwork'
import AdvancedAdjust from './AdvancedAdjust'
import SliderRow from './SliderRow'

const SLIDERS = [
  { key: 'scale', label: 'Tamanho', ...ARTWORK_LIMITS.scale, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'x', label: 'Horizontal', ...ARTWORK_LIMITS.x, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Vertical', ...ARTWORK_LIMITS.y, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'rotation', label: 'Rotação', ...ARTWORK_LIMITS.rotation, step: 1, format: (v: number) => `${Math.round(v)}°` },
] as const

const EFFECT_OPTIONS: { type: InnerEffectType; label: string }[] = [
  { type: 'none', label: 'Nenhum' },
  { type: 'left', label: 'Esquerda' },
  { type: 'right', label: 'Direita' },
]

/** Controles de um elemento de identidade (cor, posição, escala, rotação e, no M, o efeito interno). Usado pelo inspetor */
export function ArtworkElementSection({
  id,
  label,
  artwork,
  onChange,
}: {
  id: ArtworkElementId
  label: string
  artwork: ArtworkConfig
  onChange: (artwork: ArtworkConfig) => void
}) {
  const update = (patch: Partial<ArtworkElementConfig>) => onChange({ ...artwork, [id]: { ...artwork[id], ...patch } })

  const updateEffect = (patch: Partial<InnerEffect>) =>
    onChange({ ...artwork, m: { ...artwork.m, effect: { ...artwork.m.effect, ...patch } } })

  const { effect } = artwork.m

  // elementos de identidade não podem ser ocultados, só reposicionados e recoloridos: a cor vai na mesma linha do tamanho
  const colorInput = (
    <input type="color" aria-label={`Cor: ${label}`} value={artwork[id].color} onChange={(e) => update({ color: e.target.value })} />
  )

  const renderSlider = ({ key, label: sliderLabel, min, max, step, format }: (typeof SLIDERS)[number]) => (
    <SliderRow
      key={key}
      lead={key === 'scale' ? { label: 'Cor', control: colorInput } : undefined}
      label={sliderLabel}
      min={min}
      max={max}
      step={step}
      value={artwork[id][key]}
      format={format}
      onChange={(next) => update({ [key]: next })}
    />
  )

  return (
    <section className="flex flex-col gap-2">
      {SLIDERS.filter(({ key }) => key === 'scale').map(renderSlider)}
      <AdvancedAdjust>{SLIDERS.filter(({ key }) => key !== 'scale').map(renderSlider)}</AdvancedAdjust>

      {id === 'm' && (
        <div className="mt-3 flex flex-col gap-3 border-t border-neutral-300 pt-2">
          <span className="font-semibold">Efeito interno</span>
          <div className="flex gap-2">
            {EFFECT_OPTIONS.map(({ type, label: optionLabel }) => (
              <button
                key={type}
                type="button"
                onClick={() => updateEffect({ type })}
                aria-pressed={effect.type === type}
                className={`flex-1 rounded border px-1 py-2 text-xs ${
                  effect.type === type ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
                }`}
              >
                {optionLabel}
              </button>
            ))}
          </div>

          <SliderRow
            lead={{
              label: 'Cor',
              control: (
                <input type="color" aria-label="Cor do efeito" value={effect.color} onChange={(e) => updateEffect({ color: e.target.value })} />
              ),
            }}
            label="Intensidade"
            min={0}
            max={1}
            value={effect.intensity}
            onChange={(next) => updateEffect({ intensity: next })}
          />
        </div>
      )}
    </section>
  )
}
