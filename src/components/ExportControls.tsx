import { Download, ImagePlus, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { EXPORT_FORMATS, shouldShare, type ExportFormat, type ExportOptions } from './exportImage'
import { BackdropCanvas } from './StageBackdrop'
import { BACKDROPS, type BackdropColors, type BackdropId } from './stageBackdrops'

/** Seção "Fundo": miniaturas (pintadas pelo mesmo pintor do palco); escolher troca o fundo na hora */
export function BackdropControls({
  backdrop,
  colors,
  onChange,
  onUpload,
}: {
  backdrop: BackdropId
  colors: BackdropColors
  onChange: (backdrop: BackdropId) => void
  onUpload: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const custom = backdrop === 'custom'
  return (
    <div className="grid grid-cols-2 gap-2">
      {BACKDROPS.map(({ id, label }) => {
        const active = id === backdrop
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`flex flex-col gap-1.5 border p-1.5 text-left text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              active ? 'border-primary text-primary' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
            }`}
          >
            <span className="relative block aspect-[16/10] w-full overflow-hidden bg-black">
              <BackdropCanvas id={id} colors={colors} />
            </span>
            {label}
          </button>
        )
      })}
      {/* fundo do usuário: ocupa a largura das duas colunas; com imagem enviada, mostra a miniatura dela */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-pressed={custom}
        className={`col-span-2 flex items-center justify-center gap-2 border px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
          custom ? 'border-primary text-primary' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
        }`}
      >
        <ImagePlus size={14} aria-hidden />
        {colors.image ? 'Trocar fundo personalizado' : 'Enviar fundo personalizado'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}

const choice = (active: boolean) =>
  `flex-1 border px-2 py-2 text-left transition-colors ${
    active ? 'border-primary bg-primary/10 text-primary' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
  }`

/** Seção "Exportar": com fundo ou só a lata, formato (Instagram ou 16:9) e o botão de baixar */
export function ExportControls({
  options,
  onOptionsChange,
  onExport,
}: {
  options: ExportOptions
  onOptionsChange: (options: ExportOptions) => void
  onExport: (options: ExportOptions) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const download = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await onExport(options)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5">Incluir</legend>
        <div className="flex gap-2">
          <button type="button" aria-pressed={options.withBackground} onClick={() => onOptionsChange({ ...options, withBackground: true })} className={choice(options.withBackground)}>
            <span className="block text-xs font-semibold">Com fundo</span>
            <span className="block text-[10px] text-neutral-400">o fundo escolhido</span>
          </button>
          <button type="button" aria-pressed={!options.withBackground} onClick={() => onOptionsChange({ ...options, withBackground: false })} className={choice(!options.withBackground)}>
            <span className="block text-xs font-semibold">Só a lata</span>
            <span className="block text-[10px] text-neutral-400">PNG transparente</span>
          </button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5">Formato</legend>
        <div className="flex gap-2">
          {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              aria-pressed={options.format === format}
              onClick={() => onOptionsChange({ ...options, format })}
              className={choice(options.format === format)}
            >
              <span className="block text-xs font-semibold">{EXPORT_FORMATS[format].label}</span>
              <span className="block text-[10px] text-neutral-400">{EXPORT_FORMATS[format].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="flex min-h-12 items-center justify-center gap-2 bg-primary px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
        {busy ? 'Gerando…' : shouldShare() ? 'Salvar ou compartilhar' : 'Baixar PNG'}
      </button>
      {failed && <p role="alert" className="text-red-400">Não foi possível gerar a imagem. Tente de novo.</p>}
      <p className="text-[10px] normal-case tracking-normal text-neutral-400">
        A lata sai como você a vê agora: gire e aproxime antes de baixar para escolher o enquadramento.
      </p>
    </div>
  )
}
