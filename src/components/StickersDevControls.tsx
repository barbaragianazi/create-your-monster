import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  createSticker,
  duplicateSticker,
  loadStickerFile,
  STICKER_HINT,
  STICKER_LIMITS,
  StickerError,
  type Sticker,
} from './canStickers'
import AdvancedAdjust from './AdvancedAdjust'
import SliderRow from './SliderRow'

const SLIDERS = [
  { key: 'x', label: 'Horizontal', ...STICKER_LIMITS.x, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'y', label: 'Vertical', ...STICKER_LIMITS.y, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'scale', label: 'Tamanho', ...STICKER_LIMITS.scale, step: 0.01, format: (v: number) => v.toFixed(2) },
  { key: 'rotation', label: 'Rotação', ...STICKER_LIMITS.rotation, step: 1, format: (v: number) => `${Math.round(v)}°` },
] as const

const buttonClass = 'flex-1 rounded border border-neutral-400 bg-white px-1 py-2 text-xs disabled:opacity-40'

// Controles de uma seção do painel de edição (o cabeçalho e o acordeão ficam no EditorPanel)
export default function StickersDevControls({
  stickers,
  onChange,
  selectedId,
  onSelect,
}: {
  stickers: Sticker[]
  onChange: Dispatch<SetStateAction<Sticker[]>>
  /** id do sticker selecionado (a seleção é do App, compartilhada com a manipulação direta sobre a lata) */
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const setSelectedId = onSelect

  const selected = stickers.find((sticker) => sticker.id === selectedId) ?? null
  const selectedIndex = selected ? stickers.indexOf(selected) : -1

  const renderSlider = ({ key, label, min, max, step, format }: (typeof SLIDERS)[number], sticker: Sticker) => (
    <SliderRow
      key={key}
      label={label}
      min={min}
      max={max}
      step={step}
      value={sticker[key]}
      format={format}
      onChange={(next) => update(sticker.id, { [key]: next })}
    />
  )

  const update = (id: string, patch: Partial<Sticker>) =>
    onChange((prev) => prev.map((sticker) => (sticker.id === id ? { ...sticker, ...patch } : sticker)))

  // Processa os arquivos um a um (evita vários rasters grandes ao mesmo tempo); os inválidos não impedem os demais
  const addFiles = async (files: File[]) => {
    const created: Sticker[] = []
    const messages: string[] = []
    for (const file of files) {
      try {
        created.push(createSticker(file.name, await loadStickerFile(file), stickers.length + created.length))
      } catch (error) {
        messages.push(`${file.name}: ${error instanceof StickerError ? error.message : 'Não foi possível ler a imagem.'}`)
      }
    }
    setErrors(messages)
    if (created.length > 0) {
      onChange((prev) => [...prev, ...created])
      setSelectedId(created[created.length - 1].id)
    }
  }

  const duplicate = () => {
    if (!selected) return
    const copy = duplicateSticker(selected)
    onChange((prev) => {
      const index = prev.findIndex((sticker) => sticker.id === selected.id)
      return index < 0 ? prev : [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]
    })
    setSelectedId(copy.id)
  }

  const remove = () => {
    if (!selected) return
    onChange((prev) => prev.filter((sticker) => sticker.id !== selected.id))
    setSelectedId(null)
  }

  // A ordem só existe entre os stickers; todos ficam na frente da custom artwork e da identidade (M, MONSTER, ENERGY, textos)
  const reorder = (toFront: boolean) => {
    if (!selected) return
    onChange((prev) => {
      const item = prev.find((sticker) => sticker.id === selected.id)
      if (!item) return prev
      const others = prev.filter((sticker) => sticker !== item)
      return toFront ? [...others, item] : [item, ...others]
    })
  }

  return (
    <div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".png,.svg,image/png,image/svg+xml"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = '' // permite escolher o mesmo arquivo de novo
            if (files.length > 0) void addFiles(files)
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-dashed border-neutral-500 bg-white px-2 py-2 font-semibold"
        >
          + Adicionar sticker
        </button>
        <p className="text-xs text-neutral-600">{STICKER_HINT}</p>

        {errors.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 rounded bg-red-100 p-2 text-xs text-red-800">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        {stickers.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Adesivos (o de cima fica na frente)">
            {[...stickers].reverse().map((sticker) => (
              <li key={sticker.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(sticker.id)}
                  aria-pressed={sticker.id === selectedId}
                  className={`w-full truncate rounded border px-2 py-1 text-left text-xs ${
                    sticker.id === selectedId
                      ? 'border-neutral-800 bg-neutral-800 text-white'
                      : 'border-neutral-400 bg-white'
                  } ${sticker.visible ? '' : 'opacity-50'}`}
                >
                  {sticker.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <section className="mt-3 flex flex-col gap-3 border-t border-neutral-300 pt-2">
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={selected.visible}
                onChange={(e) => update(selected.id, { visible: e.target.checked })}
              />
              Visível
            </label>

            {SLIDERS.filter(({ key }) => key === 'scale').map((slider) => renderSlider(slider, selected))}

            <SliderRow
              label="Opacidade"
              min={0}
              max={100}
              step={1}
              value={Math.round(selected.opacity * 100)}
              format={(v) => `${Math.round(v)}%`}
              onChange={(next) => update(selected.id, { opacity: next / 100 })}
            />

            <AdvancedAdjust>{SLIDERS.filter(({ key }) => key !== 'scale').map((slider) => renderSlider(slider, selected))}</AdvancedAdjust>

            <div className="flex gap-2">
              <button type="button" className={buttonClass} disabled={selectedIndex === stickers.length - 1} onClick={() => reorder(true)}>
                Trazer para frente
              </button>
              <button type="button" className={buttonClass} disabled={selectedIndex === 0} onClick={() => reorder(false)}>
                Enviar para trás
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" className={buttonClass} onClick={duplicate}>
                Duplicar
              </button>
              <button type="button" className={buttonClass} onClick={remove}>
                Excluir
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
