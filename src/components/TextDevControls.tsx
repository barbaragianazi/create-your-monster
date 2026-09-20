import {
  FONT_WEIGHT_LABELS,
  TEXT_LIMITS,
  getAvailableFonts,
  getFontDef,
  resolveFontWeight,
  type FontId,
  type FontWeight,
  type TextAlign,
  type TextStroke,
  type TextStyle,
} from './canTypography'
import {
  TEXT_BACKGROUND_LIMITS,
  TEXT_POSITION_LIMITS,
  TEXT_ELEMENTS,
  type TextBackground,
  type TextElementConfig,
  type TextElementDef,
  type TextElementId,
  type TextsConfig,
} from './canText'

// Ferramenta temporária de calibração (não faz parte da UI final). x/y/rotation/fontSize são propriedades do elemento,
// não dos sliders: a edição direta futura (drag/touch sobre a lata) escreve nas mesmas propriedades.

const ALIGN_OPTIONS: { id: TextAlign; label: string }[] = [
  { id: 'left', label: 'Esquerda' },
  { id: 'center', label: 'Centro' },
  { id: 'right', label: 'Direita' },
]

const BUTTON_ON = 'border-neutral-800 bg-neutral-800 text-white'
const BUTTON_OFF = 'border-neutral-400 bg-white'

function SliderRow({
  label,
  scope,
  min,
  max,
  step = 0.01,
  value,
  format = (v) => v.toFixed(2),
  onChange,
}: {
  label: string
  scope: string
  min: number
  max: number
  step?: number
  value: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${scope}: ${label}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-right tabular-nums">{format(value)}</span>
    </label>
  )
}

function ToggleRow({
  label,
  scope,
  checked,
  onChange,
}: {
  label: string
  scope: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} aria-label={`${scope}: ${label}`} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function ChoiceRow<T extends string | number>({
  label,
  scope,
  options,
  value,
  onChange,
}: {
  label: string
  scope: string
  options: { id: T; label: string; disabled?: boolean; title?: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span>{label}</span>
      <div role="group" aria-label={`${scope}: ${label}`} className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            title={option.title}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded border px-1 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
              value === option.id ? BUTTON_ON : BUTTON_OFF
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Controles tipográficos completos, na ordem: texto, fonte, peso, tamanho, espaçamento, alinhamento, maiúsculas, cor,
// contorno, rotação, auto ajustar, largura máxima, posição, visibilidade
function FullControls({
  def,
  config,
  onChange,
  showVisibility,
}: {
  def: TextElementDef
  config: TextElementConfig
  onChange: (patch: Partial<TextElementConfig>) => void
  showVisibility: boolean
}) {
  const { style } = config
  const scope = def.label
  const patchStyle = (patch: Partial<TextStyle>) => onChange({ style: { ...style, ...patch } })
  const patchStroke = (patch: Partial<TextStroke>) => patchStyle({ stroke: { ...style.stroke, ...patch } })

  // fontes realmente instaladas; a fonte atual sempre aparece, mesmo que este dispositivo não a tenha
  const fonts = getAvailableFonts()
  const fontOptions = fonts.some((font) => font.id === style.fontFamily) ? fonts : [...fonts, getFontDef(style.fontFamily)]
  const fontDef = getFontDef(style.fontFamily)
  const effectiveWeight = resolveFontWeight(style.fontFamily, style.fontWeight)
  const weightOptions = (Object.keys(FONT_WEIGHT_LABELS).map(Number) as FontWeight[]).map((weight) => ({
    id: weight,
    label: FONT_WEIGHT_LABELS[weight],
    disabled: !fontDef.weights.includes(weight),
    title: fontDef.weights.includes(weight) ? undefined : `${fontDef.label} não tem ${FONT_WEIGHT_LABELS[weight]} real`,
  }))
  // o anel (texto superior) distribui as repetições sozinho: alinhamento, rotação e largura máxima não se aplicam
  const ring = Boolean(def.ring)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide">{def.label}</h3>

      <input
        type="text"
        value={config.content}
        maxLength={40}
        onChange={(e) => onChange({ content: e.target.value })}
        aria-label={`${scope}: Texto`}
        className="rounded border border-neutral-400 bg-white px-2 py-1"
      />

      <label className="flex flex-col gap-1">
        Fonte
        <select
          value={style.fontFamily}
          aria-label={`${scope}: Fonte`}
          onChange={(e) => patchStyle({ fontFamily: e.target.value as FontId })}
          className="rounded border border-neutral-400 bg-white px-2 py-1"
        >
          {fontOptions.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <ChoiceRow<FontWeight>
        label="Peso"
        scope={scope}
        options={weightOptions}
        value={effectiveWeight}
        onChange={(fontWeight) => patchStyle({ fontWeight })}
      />

      <SliderRow
        label="Tamanho"
        scope={scope}
        min={TEXT_LIMITS.fontSize.min}
        max={TEXT_LIMITS.fontSize.max}
        value={style.fontSize}
        onChange={(fontSize) => patchStyle({ fontSize })}
      />
      <SliderRow
        label="Espaçamento"
        scope={scope}
        min={TEXT_LIMITS.letterSpacing.min}
        max={TEXT_LIMITS.letterSpacing.max}
        value={style.letterSpacing}
        onChange={(letterSpacing) => patchStyle({ letterSpacing })}
      />

      {!ring && (
        <ChoiceRow<TextAlign>
          label="Alinhamento"
          scope={scope}
          options={ALIGN_OPTIONS}
          value={style.textAlign}
          onChange={(textAlign) => patchStyle({ textAlign })}
        />
      )}

      <ToggleRow label="MAIÚSCULAS" scope={scope} checked={style.uppercase} onChange={(uppercase) => patchStyle({ uppercase })} />

      <label className="flex items-center justify-between gap-2">
        Cor
        <input
          type="color"
          value={style.color}
          aria-label={`${scope}: Cor`}
          onChange={(e) => patchStyle({ color: e.target.value })}
        />
      </label>

      <ToggleRow label="Contorno" scope={scope} checked={style.stroke.enabled} onChange={(enabled) => patchStroke({ enabled })} />
      {style.stroke.enabled && (
        <>
          <label className="flex items-center justify-between gap-2">
            Cor do contorno
            <input
              type="color"
              value={style.stroke.color}
              aria-label={`${scope}: Cor do contorno`}
              onChange={(e) => patchStroke({ color: e.target.value })}
            />
          </label>
          <SliderRow
            label="Espessura"
            scope={scope}
            min={TEXT_LIMITS.strokeWidth.min}
            max={TEXT_LIMITS.strokeWidth.max}
            value={style.stroke.width}
            onChange={(width) => patchStroke({ width })}
          />
        </>
      )}

      {!ring && (
        <>
          <SliderRow
            label="Rotação"
            scope={scope}
            min={TEXT_LIMITS.rotation.min}
            max={TEXT_LIMITS.rotation.max}
            step={1}
            value={style.rotation}
            format={(v) => `${Math.round(v)}°`}
            onChange={(rotation) => patchStyle({ rotation })}
          />
          <ToggleRow label="Auto ajustar" scope={scope} checked={style.autoFit} onChange={(autoFit) => patchStyle({ autoFit })} />
          <SliderRow
            label="Largura máx."
            scope={scope}
            min={TEXT_LIMITS.maxWidth.min}
            max={TEXT_LIMITS.maxWidth.max}
            value={style.maxWidth}
            onChange={(maxWidth) => patchStyle({ maxWidth })}
          />
        </>
      )}

      <SliderRow label="Posição X" scope={scope} {...TEXT_POSITION_LIMITS.x} value={config.x} onChange={(x) => onChange({ x })} />
      <SliderRow label="Posição Y" scope={scope} {...TEXT_POSITION_LIMITS.y} value={config.y} onChange={(y) => onChange({ y })} />

      {showVisibility && (
        <ToggleRow label="Visível" scope={scope} checked={config.visible} onChange={(visible) => onChange({ visible })} />
      )}
    </section>
  )
}

// Estrutura própria preservada (ex.: Zero Sugar, com faixa): só texto, cor, faixa, tamanho e posição
function BasicControls({
  def,
  config,
  onChange,
  showVisibility,
}: {
  def: TextElementDef
  config: TextElementConfig
  onChange: (patch: Partial<TextElementConfig>) => void
  showVisibility: boolean
}) {
  const scope = def.label
  const patchStyle = (patch: Partial<TextStyle>) => onChange({ style: { ...config.style, ...patch } })
  const patchBackground = (patch: Partial<TextBackground>) => {
    if (!config.background) return
    const background = { ...config.background, ...patch }
    background.borderRadius = Math.max(0, Math.min(background.borderRadius, background.width / 2, background.height / 2))
    onChange({ background })
  }

  return (
    <section className="flex flex-col gap-1 [overflow-wrap:anywhere] [&_input[type=range]]:min-w-0 [&_input[type=range]]:w-full">
      <div className="flex items-center justify-between gap-2">
        {showVisibility ? (
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={config.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
            {def.label}
          </label>
        ) : (
          <span className="font-semibold">{def.label}</span>
        )}
      </div>

      <input
        type="text"
        value={config.content}
        maxLength={40}
        onChange={(e) => onChange({ content: e.target.value })}
        aria-label={`${scope}: Texto`}
        className="rounded border border-neutral-400 bg-white px-2 py-1"
      />

      <label className="flex items-center justify-between gap-2">
        Cor do texto
        <input type="color" value={config.style.color} aria-label={`${scope}: Cor do texto`}
          onChange={(e) => patchStyle({ color: e.target.value })} />
      </label>

      {def.background && config.background && (
        <>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.background.visible}
              aria-label={`${scope}: Faixa`}
              onChange={(e) => patchBackground({ visible: e.target.checked })}
            />
            Faixa
          </label>
          <label className="flex items-center justify-between gap-2">
            Cor da faixa
            <input type="color" value={config.background.color} aria-label={`${scope}: Cor da faixa`}
              onChange={(e) => patchBackground({ color: e.target.value })} />
          </label>
          <SliderRow label="Largura" scope={scope} {...TEXT_BACKGROUND_LIMITS.width}
            value={config.background.width} onChange={(width) => patchBackground({ width })} />
          <SliderRow label="Altura" scope={scope} {...TEXT_BACKGROUND_LIMITS.height}
            value={config.background.height} onChange={(height) => patchBackground({ height })} />
          <SliderRow label="Arredondamento" scope={scope} min={0}
            max={Math.min(config.background.width, config.background.height) / 2} step={0.005}
            value={config.background.borderRadius} onChange={(borderRadius) => patchBackground({ borderRadius })} />
        </>
      )}

      <SliderRow
        label="Tamanho do texto"
        scope={scope}
        min={TEXT_LIMITS.fontSize.min}
        max={TEXT_LIMITS.fontSize.max}
        value={config.style.fontSize}
        onChange={(fontSize) => patchStyle({ fontSize })}
      />
      <SliderRow label="Posição X" scope={scope} {...TEXT_POSITION_LIMITS.x} value={config.x} onChange={(x) => onChange({ x })} />
      <SliderRow label="Posição Y" scope={scope} {...TEXT_POSITION_LIMITS.y} value={config.y} onChange={(y) => onChange({ y })} />
    </section>
  )
}

/** Controles de um elemento de texto. `showVisibility = false` quando a visibilidade é decidida por outro estado */
export function TextElementSection({
  id,
  config,
  onChange,
  showVisibility = true,
}: {
  id: TextElementId
  config: TextElementConfig
  onChange: (patch: Partial<TextElementConfig>) => void
  showVisibility?: boolean
}) {
  const def = TEXT_ELEMENTS.find((element) => element.id === id)
  if (!def) return null
  const Controls = def.controls === 'full' ? FullControls : BasicControls
  return <Controls def={def} config={config} onChange={onChange} showVisibility={showVisibility} />
}

export default function TextDevControls({
  texts,
  onChange,
  exclude = [],
}: {
  texts: TextsConfig
  onChange: (texts: TextsConfig) => void
  /** elementos controlados em outro painel (ex.: Zero Sugar, que depende do tipo de açúcar) */
  exclude?: readonly TextElementId[]
}) {
  const update = (id: TextElementId, patch: Partial<TextElementConfig>) =>
    onChange({ ...texts, [id]: { ...texts[id], ...patch } })

  return (
    <details className="rounded-lg bg-white/80 p-3 text-sm text-neutral-800 shadow" open>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">Textos (dev)</summary>

      <div className="mt-3 flex flex-col gap-4">
        {TEXT_ELEMENTS.filter(({ id }) => !exclude.includes(id)).map(({ id }) => (
          <TextElementSection key={id} id={id} config={texts[id]} onChange={(patch) => update(id, patch)} />
        ))}
      </div>
    </details>
  )
}
