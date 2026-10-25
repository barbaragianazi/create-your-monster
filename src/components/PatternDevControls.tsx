import { getPatternLattice } from './canArtwork'
import type { LayerMode } from './canLayer'
import { PATTERN_DEFS, PATTERN_IDS, type PatternConfig, type PatternId } from './canPattern'
import AdvancedAdjust from './AdvancedAdjust'
import SliderRow from './SliderRow'

const SLIDERS = [
  { key: 'opacity', label: 'Opacidade', min: 0, max: 1, format: (v: number) => v.toFixed(2) },
  { key: 'scale', label: 'Tamanho', min: 0.2, max: 3, format: (v: number) => v.toFixed(2) },
  { key: 'rotation', label: 'Rotação', min: -180, max: 180, format: (v: number) => `${Math.round(v)}°` },
  { key: 'x', label: 'Horizontal', min: -2.6, max: 2.6, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Vertical', min: -1.6, max: 2, format: (v: number) => v.toFixed(2) },
] as const

// o essencial fica à vista; posição e rotação ficam em "Ajustes avançados" (a lata também se arrasta)
const BASIC: readonly string[] = ['opacity', 'scale']

const MODES: { mode: LayerMode; label: string }[] = [
  { mode: 'single', label: 'Único' },
  { mode: 'repeat', label: 'Repetir' },
]

// Controles de uma seção do painel de edição (o cabeçalho e o acordeão ficam no EditorPanel)
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

  const renderSlider = ({ key, label, min, max, format }: (typeof SLIDERS)[number]) => (
    <SliderRow
      key={key}
      label={label}
      min={min}
      max={max}
      step={key === 'rotation' ? 1 : 0.01}
      value={pattern[key]}
      format={format}
      onChange={(next) => update({ [key]: next })}
    />
  )

  return (
    <div>
      <div className="flex flex-col gap-2">
        <select
          value={pattern.id}
          onChange={(e) => selectPattern(e.target.value as PatternId | 'none')}
          aria-label="Estampa"
          className="rounded border border-neutral-400 bg-white px-2 py-1.5"
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

            {/* as duas cores dividem a linha (no celular cada uma com a amostra ao lado do rótulo) */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <label className="flex items-center gap-2">
                {def.roles.primary.label}
                <input type="color" value={pattern.primaryColor} onChange={(e) => update({ primaryColor: e.target.value })} />
              </label>

              {def.roles.secondary && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pattern.secondaryEnabled}
                    onChange={(e) => update({ secondaryEnabled: e.target.checked })}
                  />
                  {def.roles.secondary.label}
                  <input
                    type="color"
                    value={pattern.secondaryColor}
                    disabled={!pattern.secondaryEnabled}
                    onChange={(e) => update({ secondaryColor: e.target.value })}
                  />
                </label>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="pointer-coarse:sr-only">Modo</span>
              <div className="flex gap-2">
                {MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ mode })}
                    aria-pressed={pattern.mode === mode}
                    className={`flex-1 rounded border px-1 py-2 text-xs ${
                      pattern.mode === mode ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {SLIDERS.filter(({ key }) => BASIC.includes(key)).map(renderSlider)}
            <AdvancedAdjust>{SLIDERS.filter(({ key }) => !BASIC.includes(key)).map(renderSlider)}</AdvancedAdjust>

            {lattice && (
              <p className="text-xs text-neutral-600">
                Fecha a volta da lata: ~{lattice.repeats.toFixed(1)} repetições, rotação efetiva{' '}
                {lattice.rotation.toFixed(1)}°
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
