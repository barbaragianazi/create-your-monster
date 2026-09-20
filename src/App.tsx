import { useState } from 'react'
import ArtworkDevControls from './components/ArtworkDevControls'
import BodyFillDevControls from './components/BodyFillDevControls'
import type { BodyFill } from './components/canBodyFill'
import { DEFAULT_ARTWORK, type ArtworkConfig } from './components/canArtwork'
import { DEFAULT_CONDENSATION, type CondensationConfig } from './components/canCondensation'
import CanViewer from './components/CanViewer'
import CondensationDevControls from './components/CondensationDevControls'
import CustomArtworkDevControls from './components/CustomArtworkDevControls'
import type { CustomArtwork } from './components/canCustomArtworkLayer'
import { DEFAULT_PATTERN, type PatternConfig } from './components/canPattern'
import { DEFAULT_SUGAR, type SugarConfig } from './components/canSugarLabel'
import { DEFAULT_TEXTS, type TextsConfig } from './components/canText'
import type { Sticker } from './components/canStickers'
import {
  patchArtwork,
  patchCustomArtwork,
  patchStickers,
  patchTexts,
  CUSTOM_ARTWORK_ID,
  stickerElementId,
  stickerIdOf,
  type ElementPatch,
} from './components/canInteraction'
import { useInteractiveElements } from './components/useInteractiveElements'
import type { ArtworkElementId } from './components/canArtwork'
import type { TextElementId } from './components/canText'
import PatternDevControls from './components/PatternDevControls'
import SealDevControls from './components/SealDevControls'
import ShoulderDevControls from './components/ShoulderDevControls'
import type { CanShoulderConfig } from './components/canShoulder'
import { DEFAULT_SEAL_CUSTOMIZATION, type SealCustomization } from './components/sealStyle'
import StickersDevControls from './components/StickersDevControls'
import SugarDevControls from './components/SugarDevControls'
import TextDevControls from './components/TextDevControls'
import {
  CAN_FINISHES,
  CAN_PARTS,
  DEFAULT_CAN_CONFIG,
  type CanColorPart,
  type CanConfig,
  type CanFinish,
  type CanPart,
} from './components/canMaterials'

const FINISH_LABELS: Record<CanFinish, string> = {
  metallic: 'Metálico',
  matte: 'Fosco',
}

export default function App() {
  const [config, setConfig] = useState<CanConfig>(DEFAULT_CAN_CONFIG)
  const [pattern, setPattern] = useState<PatternConfig>(DEFAULT_PATTERN)
  const [customArtwork, setCustomArtwork] = useState<CustomArtwork | null>(null)
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [artwork, setArtwork] = useState<ArtworkConfig>(DEFAULT_ARTWORK)
  const [texts, setTexts] = useState<TextsConfig>(DEFAULT_TEXTS)
  const [sugar, setSugar] = useState<SugarConfig>(DEFAULT_SUGAR)
  const [sealCustom, setSealCustom] = useState<SealCustomization>(DEFAULT_SEAL_CUSTOMIZATION)
  const [condensation, setCondensation] = useState<CondensationConfig>(DEFAULT_CONDENSATION)

  // Manipulação direta: a seleção é única, do App, e a edição chega aos MESMOS estados que os controles DEV alteram
  const [requestedId, setSelectedId] = useState<string | null>(null)
  const elements = useInteractiveElements(artwork, texts, sugar, stickers, customArtwork)
  // se o elemento deixou de existir (sticker excluído, arte removida), não há seleção (derivado, sem efeito)
  const selectedElement = elements.find((element) => element.id === requestedId) ?? null
  const selectedId = selectedElement?.id ?? null

  const changeElement = (id: string, patch: ElementPatch) => {
    const stickerId = stickerIdOf(id)
    if (stickerId) setStickers((prev) => patchStickers(prev, stickerId, patch))
    else if (id === CUSTOM_ARTWORK_ID) setCustomArtwork((prev) => (prev ? patchCustomArtwork(prev, patch) : prev))
    else if (id === 'flavor' || id === 'zeroSugar') setTexts((prev) => patchTexts(prev, id as TextElementId, patch))
    else setArtwork((prev) => patchArtwork(prev, id as ArtworkElementId, patch))
  }

  const updateFinish = (part: CanPart, finish: CanFinish) =>
    setConfig((prev) => ({ ...prev, [part]: { ...prev[part], finish } }))

  const updateColor = (part: CanColorPart, color: string) =>
    setConfig((prev) => ({ ...prev, [part]: { ...prev[part], color } }))

  const updateBodyFill = (patch: Partial<BodyFill>) =>
    setConfig((prev) => ({ ...prev, body: { ...prev.body, fill: { ...prev.body.fill, ...patch } } }))

  const updateShoulder = (patch: Partial<CanShoulderConfig>) =>
    setConfig((prev) => ({ ...prev, shoulder: { ...prev.shoulder, ...patch } }))

  return (
    <div className="relative">
      <CanViewer
        config={config}
        pattern={pattern}
        customArtwork={customArtwork}
        stickers={stickers}
        artwork={artwork}
        texts={texts}
        condensation={condensation}
        sugar={sugar}
        sealCustom={sealCustom}
        elements={elements}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onElementChange={changeElement}
      />

      {/* indicação DEV do elemento selecionado sobre a lata */}
      {selectedElement && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-neutral-800 shadow">
          Selecionado: {selectedElement.label}
        </div>
      )}

      <div className="absolute right-4 top-4 flex max-h-[calc(100dvh-2rem)] w-70 flex-col gap-2 overflow-y-auto">
        <PatternDevControls pattern={pattern} onChange={setPattern} />
        <StickersDevControls
          stickers={stickers}
          onChange={setStickers}
          selectedId={stickerIdOf(selectedId)}
          onSelect={(id) => setSelectedId(id ? stickerElementId(id) : null)}
        />
        <CustomArtworkDevControls
          artwork={artwork}
          texts={texts}
          sugar={sugar}
          customArtwork={customArtwork}
          onChange={setCustomArtwork}
        />
        <ArtworkDevControls artwork={artwork} onChange={setArtwork} />
        <SugarDevControls sugar={sugar} onSugarChange={setSugar} texts={texts} onTextsChange={setTexts} />
        <TextDevControls texts={texts} onChange={setTexts} exclude={['zeroSugar']} />
        <CondensationDevControls condensation={condensation} onChange={setCondensation} />
      </div>

      {/* Controles temporários apenas para teste técnico */}
      <div className="absolute left-4 top-4 flex max-h-[calc(100dvh-2rem)] w-56 flex-col gap-4 overflow-y-auto rounded-lg bg-white/80 p-3 text-sm text-neutral-800 shadow">
        {(Object.keys(CAN_PARTS) as CanPart[]).map((part) => (
          <section key={part} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide">{CAN_PARTS[part].label}</h2>

            {part === 'body' ? (
              <BodyFillDevControls fill={config.body.fill} onChange={updateBodyFill} />
            ) : (
              <label className="flex items-center justify-between gap-4">
                Cor
                <input
                  type="color"
                  value={config[part].color}
                  onChange={(e) => updateColor(part, e.target.value)}
                />
              </label>
            )}

            <div className="flex flex-col gap-1">
              <span>Acabamento</span>
              <div className="flex gap-1">
                {(Object.keys(CAN_FINISHES) as CanFinish[]).map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    onClick={() => updateFinish(part, finish)}
                    aria-pressed={config[part].finish === finish}
                    className={`flex-1 rounded border px-2 py-1 ${
                      config[part].finish === finish
                        ? 'border-neutral-800 bg-neutral-800 text-white'
                        : 'border-neutral-400 bg-white'
                    }`}
                  >
                    {FINISH_LABELS[finish]}
                  </button>
                ))}
              </div>
            </div>

            {part === 'seal' && <SealDevControls value={sealCustom} sealColor={config.seal.color} onChange={setSealCustom} />}

            {/* o ombro é uma região do corpo (mesmo material): fica logo abaixo dele */}
            {part === 'body' && (
              <div className="mt-2 flex flex-col gap-2 border-t border-neutral-300 pt-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide">Ombro da lata</h2>
                <ShoulderDevControls shoulder={config.shoulder} onChange={updateShoulder} />
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
