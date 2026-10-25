import { MotionConfig } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { DEFAULT_EXPORT, type ExportOptions } from './components/exportImage'
import { DEFAULT_BACKDROP, type BackdropId } from './components/stageBackdrops'
import { useUndoRedo } from './components/useUndoRedo'
import type { BodyFill } from './components/canBodyFill'
import { DEFAULT_ARTWORK, type ArtworkConfig } from './components/canArtwork'
import { DEFAULT_CONDENSATION, type CondensationConfig } from './components/canCondensation'
import CanViewer from './components/CanViewer'
import AppHeader from './components/AppHeader'
import EditorPanel from './components/EditorPanel'
import { INITIAL_PANEL, locate, showGroup, type PanelState } from './components/editorNav'
import type { CustomArtwork } from './components/canCustomArtworkLayer'
import { DEFAULT_PATTERN, type PatternConfig } from './components/canPattern'
import { DEFAULT_SUGAR, type SugarConfig } from './components/canSugarLabel'
import { DEFAULT_TEXTS, type TextsConfig } from './components/canText'
import { type Sticker } from './components/canStickers'
import { useInteractiveElements } from './components/useInteractiveElements'
import type { CanShoulderConfig } from './components/canShoulder'
import { DEFAULT_SEAL_CUSTOMIZATION, type SealCustomization } from './components/sealStyle'
import {
  DEFAULT_CAN_CONFIG,
  type CanColorPart,
  type CanConfig,
  type CanFinish,
  type CanPart,
} from './components/canMaterials'

// Tudo o que o usuário edita (e só isso: seleção e painel aberto não entram), para desfazer/refazer e recomeçar
type EditorSnapshot = {
  config: CanConfig
  pattern: PatternConfig
  customArtwork: CustomArtwork | null
  stickers: Sticker[]
  artwork: ArtworkConfig
  texts: TextsConfig
  sugar: SugarConfig
  sealCustom: SealCustomization
  condensation: CondensationConfig
}

const DEFAULT_SNAPSHOT: EditorSnapshot = {
  config: DEFAULT_CAN_CONFIG,
  pattern: DEFAULT_PATTERN,
  customArtwork: null,
  stickers: [],
  artwork: DEFAULT_ARTWORK,
  texts: DEFAULT_TEXTS,
  sugar: DEFAULT_SUGAR,
  sealCustom: DEFAULT_SEAL_CUSTOMIZATION,
  condensation: DEFAULT_CONDENSATION,
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

  const snapshot = useMemo<EditorSnapshot>(
    () => ({ config, pattern, customArtwork, stickers, artwork, texts, sugar, sealCustom, condensation }),
    [config, pattern, customArtwork, stickers, artwork, texts, sugar, sealCustom, condensation],
  )
  const history = useUndoRedo(snapshot, (value) => {
    setConfig(value.config)
    setPattern(value.pattern)
    setCustomArtwork(value.customArtwork)
    setStickers(value.stickers)
    setArtwork(value.artwork)
    setTexts(value.texts)
    setSugar(value.sugar)
    setSealCustom(value.sealCustom)
    setCondensation(value.condensation)
  })

  // Manipulação direta: a seleção é única, do App, e a edição chega aos MESMOS estados que o painel de edição altera
  const [requestedId, setRequestedId] = useState<string | null>(null)
  // grupo e seção abertos no painel de edição; a seleção de um elemento na lata abre o grupo e a seção dele
  const [panel, setPanel] = useState<PanelState>(INITIAL_PANEL)
  const setSelectedId = (id: string | null) => {
    setRequestedId(id)
    const target = id ? locate(id) : null
    if (target) setPanel({ group: target.group, section: target.section, collapsed: false })
  }
  const elements = useInteractiveElements(artwork, texts, sugar, stickers, customArtwork)
  // se o elemento deixou de existir (sticker excluído, arte removida), não há seleção (derivado, sem efeito)
  const selectedId = elements.find((element) => element.id === requestedId)?.id ?? null

  // Fundo do palco e opções de exportação: preferências de saída, não edição da lata, então ficam fora do desfazer e do "recomeçar"
  const [backdrop, setBackdrop] = useState<BackdropId>(DEFAULT_BACKDROP)
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT)
  const exportApiRef = useRef<((options: ExportOptions) => Promise<void>) | null>(null)
  const [customImage, setCustomImage] = useState<string | null>(null)
  const uploadBackdrop = (file: File) => {
    setCustomImage((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(file)
    })
    setBackdrop('custom')
  }
  const backdropColors = {
    image: customImage,
    glow: config.body.fill.type === 'solid' ? config.body.fill.solidColor : config.body.fill.gradient.startColor,
    floor: artwork.m.color,
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
    // a página nunca rola: o título ocupa o que precisa e a área da lata (com o painel sobreposto) ocupa o resto
    <MotionConfig reducedMotion="user">
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        group={panel.group}
        onGroupChange={(group) => setPanel(showGroup(group))}
        onDownload={() => void exportApiRef.current?.(exportOptions)}
      />

      <div className="relative min-h-0 flex-1">
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
        onSelect={setSelectedId}
        onPartSelect={(part) => setPanel({ group: 'can', section: part, collapsed: false })}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        backdrop={backdrop}
        backdropColors={backdropColors}
        exportOptions={exportOptions}
        exportApiRef={exportApiRef}
        onResetAll={() => {
          setRequestedId(null)
          history.replace(DEFAULT_SNAPSHOT)
        }}
      />

      <EditorPanel
        config={config}
        onColorChange={updateColor}
        onFinishChange={updateFinish}
        onBodyFillChange={updateBodyFill}
        onShoulderChange={updateShoulder}
        pattern={pattern}
        onPatternChange={setPattern}
        stickers={stickers}
        onStickersChange={setStickers}
        customArtwork={customArtwork}
        onCustomArtworkChange={setCustomArtwork}
        artwork={artwork}
        onArtworkChange={setArtwork}
        texts={texts}
        onTextsChange={setTexts}
        sugar={sugar}
        onSugarChange={setSugar}
        sealCustom={sealCustom}
        onSealCustomChange={setSealCustom}
        condensation={condensation}
        onCondensationChange={setCondensation}
        panel={panel}
        onPanelChange={setPanel}
        selectedId={selectedId}
        onSelect={setSelectedId}
        backdrop={backdrop}
        backdropColors={backdropColors}
        onBackdropChange={setBackdrop}
        onCustomBackdrop={uploadBackdrop}
        exportOptions={exportOptions}
        onExportOptionsChange={setExportOptions}
        onExport={async (options) => {
          await exportApiRef.current?.(options)
        }}
      />
      </div>
    </div>
    </MotionConfig>
  )
}
