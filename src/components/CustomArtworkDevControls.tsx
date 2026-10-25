import { useRef, useState } from 'react'
import type { ArtworkConfig } from './canArtwork'
import {
  CUSTOM_ARTWORK_COPY,
  CUSTOM_ARTWORK_LIMITS,
  loadCustomArtworkFile,
} from './canCustomArtwork'
import type { CustomArtwork, CustomArtworkPlacement } from './canCustomArtworkLayer'
import { StickerError } from './canStickers'
import type { SugarConfig } from './canSugarLabel'
import type { TextsConfig } from './canText'
import { downloadArtworkTemplate } from './canTemplate'
import AdvancedAdjust from './AdvancedAdjust'
import SliderRow from './SliderRow'

// o essencial fica à vista; posição e rotação ficam em "Ajustes avançados" (a arte também se arrasta na lata)
const BASIC: readonly string[] = ['scale', 'opacity']

const SLIDERS = [
  { key: 'scale', label: 'Tamanho', step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'x', label: 'Horizontal', step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Vertical', step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'rotation', label: 'Rotação', step: 1, format: (v: number) => `${Math.round(v)}°` },
  { key: 'opacity', label: 'Opacidade', step: 0.01, format: (v: number) => v.toFixed(2) },
] as const

const buttonClass = 'flex-1 rounded border border-neutral-400 bg-white px-2 py-2 text-xs disabled:opacity-40'
const primaryClass = 'flex-1 rounded border border-neutral-800 bg-neutral-800 px-2 py-2 text-xs text-white disabled:opacity-50'

// Ferramenta temporária (não faz parte da UI final). O gabarito reflete as configurações ATUAIS da lata.
// Não há controle de ordem: a arte fica sempre abaixo da identidade da lata (ver canCustomArtwork).
export default function CustomArtworkDevControls({
  artwork,
  texts,
  sugar,
  customArtwork,
  onChange,
}: {
  artwork: ArtworkConfig
  texts: TextsConfig
  sugar: SugarConfig
  customArtwork: CustomArtwork | null
  onChange: (next: CustomArtwork | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadArtworkTemplate({ artwork, texts, sugar })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar o gabarito.')
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File) => {
    setError(null)
    try {
      onChange(await loadCustomArtworkFile(file))
    } catch (e) {
      setError(e instanceof StickerError ? e.message : 'Não foi possível ler a imagem.')
    }
  }

  const update = (patch: Partial<CustomArtworkPlacement>) => {
    if (customArtwork) onChange({ ...customArtwork, ...patch })
  }

  const renderSlider = ({ key, label, step, format }: (typeof SLIDERS)[number]) =>
    customArtwork && (
      <SliderRow
        key={key}
        label={label}
        {...CUSTOM_ARTWORK_LIMITS[key]}
        step={step}
        value={customArtwork[key]}
        format={format}
        onChange={(next) => update({ [key]: next })}
      />
    )

  return (
    <div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold">{CUSTOM_ARTWORK_COPY.title}</p>
        <p className="text-xs text-neutral-600">{CUSTOM_ARTWORK_COPY.description}</p>
        <p className="text-xs text-neutral-600">{CUSTOM_ARTWORK_COPY.fillAll}</p>
        <p className="text-xs text-neutral-600">{CUSTOM_ARTWORK_COPY.avoidReserved}</p>
        <p className="text-xs text-neutral-600">{CUSTOM_ARTWORK_COPY.tip}</p>
        <p className="text-xs text-neutral-600">{CUSTOM_ARTWORK_COPY.recommendation}</p>

        <input
          ref={inputRef}
          type="file"
          hidden
          accept=".png,.svg,image/png,image/svg+xml"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // permite escolher o mesmo arquivo de novo
            if (file) void upload(file)
          }}
        />

        <div className="flex gap-2">
          <button type="button" onClick={download} disabled={busy} className={primaryClass}>
            {busy ? 'Gerando…' : CUSTOM_ARTWORK_COPY.downloadTemplate}
          </button>
          {!customArtwork && (
            <button type="button" onClick={() => inputRef.current?.click()} className={buttonClass}>
              {CUSTOM_ARTWORK_COPY.uploadArtwork}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded bg-red-100 p-2 text-xs text-red-800">
            {error}
          </p>
        )}

        {customArtwork && (
          <>
            <p className="truncate text-xs font-semibold" title={customArtwork.name}>
              {customArtwork.name}
            </p>
            {customArtwork.issues.length > 0 && (
              <ul className="flex flex-col gap-1 rounded bg-amber-100 p-2 text-xs text-amber-900">
                {customArtwork.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            )}

            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={customArtwork.visible}
                onChange={(e) => update({ visible: e.target.checked })}
              />
              Visível
            </label>

            {SLIDERS.filter(({ key }) => BASIC.includes(key)).map(renderSlider)}
            <AdvancedAdjust>{SLIDERS.filter(({ key }) => !BASIC.includes(key)).map(renderSlider)}</AdvancedAdjust>

            <div className="flex gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className={buttonClass}>
                {CUSTOM_ARTWORK_COPY.replaceArtwork}
              </button>
              <button type="button" onClick={() => onChange(null)} className={buttonClass}>
                {CUSTOM_ARTWORK_COPY.removeArtwork}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
