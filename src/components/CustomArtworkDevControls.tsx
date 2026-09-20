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

const SLIDERS = [
  { key: 'scale', label: 'Escala', step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'x', label: 'Posição X', step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Posição Y', step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'rotation', label: 'Rotação', step: 1, format: (v: number) => `${Math.round(v)}°` },
  { key: 'opacity', label: 'Opacidade', step: 0.01, format: (v: number) => v.toFixed(2) },
] as const

const buttonClass = 'flex-1 rounded border border-neutral-400 bg-white px-2 py-1 text-xs disabled:opacity-40'
const primaryClass = 'flex-1 rounded border border-neutral-800 bg-neutral-800 px-2 py-1 text-xs text-white disabled:opacity-50'

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

  return (
    <details className="rounded-lg bg-white/80 p-3 text-sm text-neutral-800 shadow" open>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">Custom artwork (dev)</summary>

      <div className="mt-3 flex flex-col gap-2">
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

        <div className="flex gap-1">
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

            {SLIDERS.map(({ key, label, step, format }) => (
              <label key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
                {label}
                <input
                  type="range"
                  {...CUSTOM_ARTWORK_LIMITS[key]}
                  step={step}
                  value={customArtwork[key]}
                  onChange={(e) => update({ [key]: Number(e.target.value) })}
                />
                <span className="text-right tabular-nums">{format(customArtwork[key])}</span>
              </label>
            ))}

            <div className="flex gap-1">
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
    </details>
  )
}
