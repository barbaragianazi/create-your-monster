import { getPatternLattice } from './canArtwork'
import type { LayerMode } from './canLayer'
import { PATTERN_DEFS, PATTERN_IDS, type PatternConfig, type PatternId } from './canPattern'

const SLIDERS = [
  { key: 'opacity', label: 'Opacidade', min: 0, max: 1, format: (v: number) => v.toFixed(2) },
  { key: 'scale', label: 'Escala', min: 0.2, max: 3, format: (v: number) => v.toFixed(2) },
  { key: 'rotation', label: 'Rotação', min: -180, max: 180, format: (v: number) => `${Math.round(v)}°` },
  { key: 'x', label: 'Posição X', min: -2.6, max: 2.6, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Posição Y', min: -1.6, max: 2, format: (v: number) => v.toFixed(2) },
] as const

const MODES: { mode: LayerMode; label: string }[] = [
  { mode: 'single', label: 'Único' },
  { mode: 'repeat', label: 'Repetir' },
]

// Ferramenta temporária de calibração (não faz parte da UI final)
export default function PatternDevControls({
  pattern,
  onChange,
}: {
  pattern: PatternConfig
  onChange: (pattern: PatternConfig) => void
}) {
  const update = (patch: Partial<PatternConfig>) => onChange({ ...pattern, ...patch })

  // Trocar de pattern traz as cores originais dele; posição/escala/etc. são mantidas
  const selectPattern = (id: PatternConfig['id']) => {
    if (id === 'none') return update({ id })
    const { roles } = PATTERN_DEFS[id]
    update({ id, primaryColor: roles.primary.color, secondaryColor: roles.secondary?.color ?? pattern.secondaryColor })
  }

  const def = pattern.id === 'none' ? null : PATTERN_DEFS[pattern.id]
  const lattice = def && pattern.mode === 'repeat' ? getPatternLattice(pattern) : null

  return (
    <details className="rounded-lg bg-white/80 p-3 text-sm text-neutral-800 shadow" open>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">Pattern (dev)</summary>

      <div className="mt-3 flex flex-col gap-2">
        <select
          value={pattern.id}
          onChange={(e) => selectPattern(e.target.value as PatternId | 'none')}
          aria-label="Pattern"
          className="rounded border border-neutral-400 bg-white px-2 py-1"
        >
          <option value="none">Nenhum</option>
          {PATTERN_IDS.map((id) => (
            <option key={id} value={id}>
              {PATTERN_DEFS[id].label}
            </option>
          ))}
        </select>

        {def && (
          <>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={pattern.visible} onChange={(e) => update({ visible: e.target.checked })} />
                Visível
              </label>
            </div>

            <label className="flex items-center justify-between gap-2">
              {def.roles.primary.label} (cor principal)
              <input type="color" value={pattern.primaryColor} onChange={(e) => update({ primaryColor: e.target.value })} />
            </label>

            {def.roles.secondary && (
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pattern.secondaryEnabled}
                    onChange={(e) => update({ secondaryEnabled: e.target.checked })}
                  />
                  {def.roles.secondary.label} (cor secundária)
                </label>
                <input
                  type="color"
                  value={pattern.secondaryColor}
                  disabled={!pattern.secondaryEnabled}
                  onChange={(e) => update({ secondaryColor: e.target.value })}
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span>Modo</span>
              <div className="flex gap-1">
                {MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ mode })}
                    aria-pressed={pattern.mode === mode}
                    className={`flex-1 rounded border px-1 py-1 text-xs ${
                      pattern.mode === mode ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {SLIDERS.map(({ key, label, min, max, format }) => (
              <label key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
                {label}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={key === 'rotation' ? 1 : 0.01}
                  value={pattern[key]}
                  onChange={(e) => update({ [key]: Number(e.target.value) })}
                />
                <span className="text-right tabular-nums">{format(pattern[key])}</span>
              </label>
            ))}

            {lattice && (
              <p className="text-xs text-neutral-600">
                Fecha a volta da lata: ~{lattice.repeats.toFixed(1)} repetições, rotação efetiva{' '}
                {lattice.rotation.toFixed(1)}°
              </p>
            )}
          </>
        )}
      </div>
    </details>
  )
}
