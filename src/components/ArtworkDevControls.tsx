import {
  ARTWORK_LIMITS,
  type ArtworkConfig,
  type ArtworkElementConfig,
  type ArtworkElementId,
  type InnerEffect,
  type InnerEffectType,
} from './canArtwork'

const SLIDERS = [
  { key: 'scale', label: 'Escala', ...ARTWORK_LIMITS.scale, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'x', label: 'Posição X', ...ARTWORK_LIMITS.x, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Posição Y', ...ARTWORK_LIMITS.y, step: 0.01, format: (v: number) => v.toFixed(2) },
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

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {/* elementos de identidade: não podem ser ocultados, só reposicionados e recoloridos */}
        <span className="font-semibold">{label}</span>
        <input type="color" value={artwork[id].color} onChange={(e) => update({ color: e.target.value })} />
      </div>

      {SLIDERS.map(({ key, label: sliderLabel, min, max, step, format }) => (
        <label key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
          {sliderLabel}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={artwork[id][key]}
            onChange={(e) => update({ [key]: Number(e.target.value) })}
          />
          <span className="text-right tabular-nums">{format(artwork[id][key])}</span>
        </label>
      ))}

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

          <label className="flex items-center justify-between gap-2">
            Cor do efeito
            <input type="color" value={effect.color} onChange={(e) => updateEffect({ color: e.target.value })} />
          </label>

          <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
            Intensidade
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={effect.intensity}
              onChange={(e) => updateEffect({ intensity: Number(e.target.value) })}
            />
            <span className="text-right tabular-nums">{effect.intensity.toFixed(2)}</span>
          </label>
        </div>
      )}
    </section>
  )
}
