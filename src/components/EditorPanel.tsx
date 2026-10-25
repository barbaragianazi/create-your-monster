import { ChevronDown, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useContext, useEffect, useRef, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import BottomSheet from './BottomSheet'
import EditorScroll from './EditorScroll'
import { useIsTouch, useLayoutMode } from './useLayoutMode'
import { useParentSize } from './useParentSize'
import { setViewInset } from './viewInset'
import { ArtworkElementSection } from './ArtworkDevControls'
import BodyFillDevControls from './BodyFillDevControls'
import { ARTWORK_ELEMENTS, type ArtworkConfig } from './canArtwork'
import type { BodyFill } from './canBodyFill'
import type { CondensationConfig } from './canCondensation'
import { stickerElementId, stickerIdOf } from './canInteraction'
import type { CanShoulderConfig } from './canShoulder'
import type { CustomArtwork } from './canCustomArtworkLayer'
import {
  CAN_FINISHES,
  CAN_PARTS,
  type CanColorPart,
  type CanConfig,
  type CanFinish,
  type CanPart,
} from './canMaterials'
import { PATTERN_DEFS, type PatternConfig } from './canPattern'
import type { Sticker } from './canStickers'
import { SUGAR_LABEL_OPTIONS, type SugarConfig } from './canSugarLabel'
import { TEXT_ELEMENTS, type TextElementConfig, type TextElementId, type TextsConfig } from './canText'
import { FIRST_SECTION, GROUPS, locate, type GroupId, type PanelState } from './editorNav'
import { EXPORT_FORMATS, type ExportOptions } from './exportImage'
import { BackdropControls, ExportControls } from './ExportControls'
import { BACKDROPS, type BackdropColors, type BackdropId } from './stageBackdrops'
import CondensationDevControls from './CondensationDevControls'
import CustomArtworkDevControls from './CustomArtworkDevControls'
import PatternDevControls from './PatternDevControls'
import SealDevControls from './SealDevControls'
import ShoulderDevControls from './ShoulderDevControls'
import StickersDevControls from './StickersDevControls'
import SugarDevControls from './SugarDevControls'
import { TextElementSection } from './TextDevControls'
import type { SealCustomization } from './sealStyle'

/*
 * Painel de edição único, à esquerda: uma coluna de ícones (os grupos) e, ao lado, o grupo ativo em seções de acordeão (uma aberta
 * por vez). Todos os controles são os mesmos de antes, só reorganizados por lógica de uso; cada um edita o mesmo estado do App.
 * Clicar num elemento na lata abre o grupo e a seção dele (a seleção é do App).
 */

/** celular (gaveta ou paisagem): menos margem nas seções e alvos maiores */
const CompactContext = createContext(false)

const FINISH_LABELS: Record<CanFinish, string> = {
  metallic: 'Metálico',
}

function Section({
  id,
  title,
  summary,
  active,
  open,
  onToggle,
  bare = false,
  children,
}: {
  id: string
  title: string
  /** grupo de uma seção só: o título da seção repetiria o do painel, então o conteúdo aparece direto, sem a barra de título */
  bare?: boolean
  /** resumo mostrado com a seção fechada (uma amostra de cor, uma contagem...) */
  summary?: ReactNode
  /** o elemento selecionado na lata é o desta seção */
  active?: boolean
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const compact = useContext(CompactContext)
  // espera a animação de abertura terminar para rolar até o fim da seção (a altura ainda está crescendo antes disso)
  useEffect(() => {
    if (!open || bare) return
    const timer = window.setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 240)
    return () => window.clearTimeout(timer)
  }, [open, bare])

  if (bare) {
    return (
      <section ref={ref} aria-label={title}>
        <div className={`monster-card-body bg-neutral-950 py-4 ${compact ? 'px-4' : 'px-6'}`}><div className="flex flex-col gap-5">{children}</div></div>
      </section>
    )
  }

  return (
    <section ref={ref} className="border-b border-black">
      <h3>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={open}
          aria-controls={`section-${id}`}
          // barra de título: fundo e borda próprios (fechada: cinza, com seta; aberta: preta, verde e com a marca à esquerda), para não se
          // confundir com o conteúdo, que é só rótulo e controle sobre o fundo escuro
          className={`flex min-h-12 w-full cursor-pointer items-center gap-2 border-l-2 px-3 py-3 text-left text-xs font-semibold uppercase tracking-widest transition-colors ${
            open
              ? 'border-l-primary bg-black text-primary'
              : 'border-l-transparent bg-neutral-800 text-white hover:border-l-primary/60 hover:bg-neutral-700'
          }`}
        >
          <span aria-hidden className={`size-1.5 shrink-0 ${active ? 'bg-primary' : 'bg-transparent'}`} />
          <span className="flex-1 truncate">{title}</span>
          {!open && summary !== undefined && <span className="max-w-[42%] shrink-0 truncate font-normal normal-case tracking-normal text-neutral-300">{summary}</span>}
          <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center border ${open ? 'border-primary/60' : 'border-neutral-500'}`}>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            id={`section-${id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={`monster-card-body border-l-2 border-l-primary/40 bg-neutral-950 py-4 ${compact ? 'pl-4 pr-3' : 'pl-6 pr-4'}`}><div className="flex flex-col gap-5">{children}</div></div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

// largura que o painel ocupa à esquerda (margem + coluna de abas + painel aberto), em px, para recentrar a lata no resto do palco
const SIDE = {
  desktop: { margin: 16, nav: 80, panel: 320 },
  landscape: { margin: 0, nav: 64, panel: 288 },
}
// a partir desta largura de palco, o desktop deixa a lata centrada (o painel flutua sobre a parte esquerda, como sempre foi)
const WIDE_STAGE = 1180

const swatch = (background: string) => <span aria-hidden className="block h-3 w-5 border border-neutral-600" style={{ background }} />

// o corpo (e o ombro que o acompanha) pode ser sólido ou degradê: a amostra mostra o que está valendo
const bodyFillBackground = ({ type, solidColor, gradient }: BodyFill) =>
  type === 'solid' ? solidColor : `linear-gradient(${gradient.angle}deg, ${gradient.startColor}, ${gradient.endColor})`

export default function EditorPanel({
  config,
  onColorChange,
  onFinishChange,
  onBodyFillChange,
  onShoulderChange,
  pattern,
  onPatternChange,
  stickers,
  onStickersChange,
  customArtwork,
  onCustomArtworkChange,
  artwork,
  onArtworkChange,
  texts,
  onTextsChange,
  sugar,
  onSugarChange,
  sealCustom,
  onSealCustomChange,
  condensation,
  onCondensationChange,
  panel,
  onPanelChange,
  selectedId,
  onSelect,
  backdrop,
  backdropColors,
  onBackdropChange,
  onCustomBackdrop,
  exportOptions,
  onExportOptionsChange,
  onExport,
}: {
  config: CanConfig
  onColorChange: (part: CanColorPart, color: string) => void
  onFinishChange: (part: CanPart, finish: CanFinish) => void
  onBodyFillChange: (patch: Partial<BodyFill>) => void
  onShoulderChange: (patch: Partial<CanShoulderConfig>) => void
  pattern: PatternConfig
  onPatternChange: (pattern: PatternConfig) => void
  stickers: Sticker[]
  onStickersChange: Dispatch<SetStateAction<Sticker[]>>
  customArtwork: CustomArtwork | null
  onCustomArtworkChange: (next: CustomArtwork | null) => void
  artwork: ArtworkConfig
  onArtworkChange: (artwork: ArtworkConfig) => void
  texts: TextsConfig
  onTextsChange: (texts: TextsConfig) => void
  sugar: SugarConfig
  onSugarChange: (sugar: SugarConfig) => void
  sealCustom: SealCustomization
  onSealCustomChange: (next: SealCustomization) => void
  condensation: CondensationConfig
  onCondensationChange: (condensation: CondensationConfig) => void
  /** grupo e seção abertos (o estado é do App: o cabeçalho e a seleção na lata também o mudam) */
  panel: PanelState
  onPanelChange: (next: PanelState) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  backdrop: BackdropId
  /** cores da lata que os fundos usam (halo e chão) */
  backdropColors: BackdropColors
  onBackdropChange: (backdrop: BackdropId) => void
  onCustomBackdrop: (file: File) => void
  exportOptions: ExportOptions
  onExportOptionsChange: (options: ExportOptions) => void
  onExport: (options: ExportOptions) => Promise<void>
}) {
  const { group, collapsed, section: openSection } = panel
  const activeSection = selectedId ? locate(selectedId)?.section ?? null : null

  const toggle = (id: string) => onPanelChange({ ...panel, section: openSection === id ? null : id })
  const sectionProps = (id: string) => ({ id, open: openSection === id, onToggle: toggle, active: activeSection === id })

  const updateText = (id: TextElementId, patch: Partial<TextElementConfig>) =>
    onTextsChange({ ...texts, [id]: { ...texts[id], ...patch } })

  const finishPicker = (part: CanPart) =>
    Object.keys(CAN_FINISHES).length > 1 && (
      <div className="mt-2 flex flex-col gap-2">
        <span>Acabamento</span>
        <div className="flex gap-2">
          {(Object.keys(CAN_FINISHES) as CanFinish[]).map((finish) => (
            <button
              key={finish}
              type="button"
              onClick={() => onFinishChange(part, finish)}
              aria-pressed={config[part].finish === finish}
              className={`flex-1 rounded border px-2 py-2 ${
                config[part].finish === finish ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-400 bg-white'
              }`}
            >
              {FINISH_LABELS[finish]}
            </button>
          ))}
        </div>
      </div>
    )

  const colorPart = (part: CanColorPart) => (
    <Section key={part} {...sectionProps(part)} title={CAN_PARTS[part].label} summary={swatch(config[part].color)}>
      <label className="flex items-center justify-between gap-4">
        Cor
        <input type="color" value={config[part].color} onChange={(e) => onColorChange(part, e.target.value)} />
      </label>
      {finishPicker(part)}
      {part === 'seal' && (
        <div className="mt-3">
          <SealDevControls value={sealCustom} sealColor={config.seal.color} onChange={onSealCustomChange} />
        </div>
      )}
    </Section>
  )

  const content: Record<GroupId, ReactNode> = {
    can: (
      <>
        <Section {...sectionProps('body')} title={CAN_PARTS.body.label} summary={swatch(bodyFillBackground(config.body.fill))}>
          <BodyFillDevControls fill={config.body.fill} onChange={onBodyFillChange} />
          {finishPicker('body')}
        </Section>
        <Section {...sectionProps('shoulder')} title="Ombro da lata"
          summary={swatch(config.shoulder.inheritBodyColor ? bodyFillBackground(config.body.fill) : config.shoulder.color)}
        >
          <ShoulderDevControls shoulder={config.shoulder} onChange={onShoulderChange} />
        </Section>
        {colorPart('top')}
        {colorPart('bottom')}
        {colorPart('seal')}
      </>
    ),
    identity: (
      <>
        {ARTWORK_ELEMENTS.map(({ id, label }) => (
          <Section key={id} {...sectionProps(id)} title={label} summary={swatch(artwork[id].color)}>
            <ArtworkElementSection id={id} label={label} artwork={artwork} onChange={onArtworkChange} />
          </Section>
        ))}
      </>
    ),
    text: (
      <>
        {TEXT_ELEMENTS.filter(({ id }) => id !== 'zeroSugar').map(({ id, label }) => (
          <Section key={id} {...sectionProps(id)} title={label} summary={texts[id].visible ? undefined : 'oculto'}>
            <TextElementSection
              id={id}
              config={texts[id]}
              onChange={(patch) => updateText(id, patch)}
              showVisibility={id !== 'flavor'} // identidade da lata: não pode ser ocultado
            />
          </Section>
        ))}
        {/* o Zero Sugar não tem visibilidade própria: depende do tipo de açúcar, então os controles dele ficam aqui */}
        <Section {...sectionProps('sugar')} title="Selo de açúcar" summary={SUGAR_LABEL_OPTIONS.find(({ id }) => id === sugar.type)?.label}>
          <SugarDevControls sugar={sugar} onSugarChange={onSugarChange} texts={texts} onTextsChange={onTextsChange} />
        </Section>
      </>
    ),
    custom: (
      <>
        <Section {...sectionProps('pattern')} title="Estampa" summary={pattern.id === 'none' ? 'nenhuma' : PATTERN_DEFS[pattern.id].label}>
          <PatternDevControls pattern={pattern} onChange={onPatternChange} />
        </Section>
        <Section {...sectionProps('customArtwork')} title="Arte própria" summary={customArtwork ? 'ativa' : undefined}>
          <CustomArtworkDevControls
            artwork={artwork}
            texts={texts}
            sugar={sugar}
            customArtwork={customArtwork}
            onChange={onCustomArtworkChange}
          />
        </Section>
        <Section {...sectionProps('stickers')} title="Adesivos" summary={stickers.length > 0 ? stickers.length : undefined}>
          <StickersDevControls
            stickers={stickers}
            onChange={onStickersChange}
            selectedId={stickerIdOf(selectedId)}
            onSelect={(id) => onSelect(id ? stickerElementId(id) : null)}
          />
        </Section>
      </>
    ),
    effects: (
      <Section {...sectionProps('condensation')} title="Condensação" bare>
        <CondensationDevControls condensation={condensation} onChange={onCondensationChange} />
      </Section>
    ),
    export: (
      <>
        <Section {...sectionProps('backdrop')} title="Fundo" summary={backdrop === 'custom' ? 'Personalizado' : BACKDROPS.find(({ id }) => id === backdrop)?.label}>
          <BackdropControls backdrop={backdrop} colors={backdropColors} onChange={onBackdropChange} onUpload={onCustomBackdrop} />
        </Section>
        <Section
          {...sectionProps('download')}
          title="Exportar imagem"
          summary={EXPORT_FORMATS[exportOptions.format].label}
        >
          <ExportControls options={exportOptions} onOptionsChange={onExportOptionsChange} onExport={onExport} />
        </Section>
      </>
    ),
  }

  const current = GROUPS.find((candidate) => candidate.id === group) ?? GROUPS[0]
  const mode = useLayoutMode()
  const isTouch = useIsTouch()
  const compact = mode !== 'desktop'

  const root = useRef<HTMLDivElement>(null)
  const stage = useParentSize(root, mode)
  // Em modos laterais, a lata é recentrada na parte do palco que o painel não cobre (no desktop largo ela fica sob o painel, como sempre)
  // no desktop o painel cresce com a tela (de 320px até 480px) para dar mais espaço às barras de ajuste
  const desktopPanel = Math.round(Math.min(480, Math.max(320, stage.width * 0.3)))
  const sideWidth = mode === 'landscape' ? SIDE.landscape : { ...SIDE.desktop, panel: desktopPanel }
  const covered = sideWidth.margin + sideWidth.nav + (collapsed ? 0 : sideWidth.panel)
  const sideInset = mode === 'sheet' || (mode === 'desktop' && stage.width >= WIDE_STAGE) ? 0 : covered
  useEffect(() => {
    setViewInset('side', sideInset ? { left: sideInset } : null)
    return () => setViewInset('side', null)
  }, [sideInset])

  // Esc fecha o painel de edição (o botão "ESC" do cabeçalho faz o mesmo)
  useEffect(() => {
    if (collapsed) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onPanelChange({ ...panel, collapsed: true })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [collapsed, panel, onPanelChange])

  const toggleGroup = (id: GroupId) => {
    if (id === group && !collapsed) onPanelChange({ ...panel, collapsed: true })
    else onPanelChange({ group: id, section: FIRST_SECTION[id], collapsed: false })
  }

  // 1–6 abrem (ou fecham, se já está aberta) a aba correspondente; ignorado ao digitar em campos e com Ctrl/Alt/Meta
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
      const shortcutGroup = /^[1-6]$/.test(event.key) ? GROUPS[Number(event.key) - 1] : undefined
      if (!shortcutGroup) return
      event.preventDefault()
      toggleGroup(shortcutGroup.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const tabs = GROUPS.map(({ id, label, shortLabel, icon: Icon }, index) => {
    const active = id === group && !collapsed
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggleGroup(id)}
        aria-pressed={active}
        aria-label={label}
        aria-keyshortcuts={String(index + 1)}
        title={isTouch ? label : `${label} (tecla ${index + 1})`}
        className={`flex flex-1 touch-manipulation flex-col items-center justify-center gap-1 border-b-2 px-0.5 py-2 text-[10px] font-medium uppercase tracking-normal transition-colors active:bg-neutral-800 md:flex-none md:border-b-0 md:border-l-2 md:text-[9px] ${
          mode === 'sheet' ? 'min-h-14' : ''
        } ${mode === 'landscape' ? 'min-h-11 border-b-0 border-l-2 py-0.5' : ''} ${
          active ? 'border-primary bg-neutral-900 text-primary' : 'border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-white'
        }`}
      >
        <Icon size={20} aria-hidden />
        <span aria-hidden>{mode === 'desktop' ? label : (shortLabel ?? label)}</span>
      </button>
    )
  })

  if (mode === 'sheet') {
    return (
      <CompactContext.Provider value>
        <BottomSheet open={!collapsed} onOpenChange={(open) => onPanelChange({ ...panel, collapsed: !open })} title={current.label} tabs={<nav aria-label="Grupos de edição" className="flex">{tabs}</nav>}>
          {content[group]}
        </BottomSheet>
      </CompactContext.Provider>
    )
  }

  return (
    <CompactContext.Provider value={compact}>
      <motion.div
        ref={root}
        style={{ '--panel-w': `${desktopPanel}px` } as CSSProperties}
        initial={{ x: -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className={
          mode === 'landscape'
            ? 'pointer-events-none absolute inset-y-0 left-0 z-10 flex safe-x'
            : 'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col-reverse md:inset-x-auto md:inset-y-0 md:left-4 md:flex-row md:items-center md:py-4'
        }
      >
        <nav
          aria-label="Grupos de edição"
          className={
            mode === 'landscape'
              ? 'pointer-events-auto flex w-16 shrink-0 flex-col overflow-y-auto border-r border-neutral-800 bg-black'
              : 'pointer-events-auto flex shrink-0 justify-around border-t border-neutral-800 bg-black md:absolute md:left-0 md:top-1/2 md:w-20 md:-translate-y-1/2 md:flex-col md:justify-start md:border md:border-t'
          }
        >
          {tabs}
        </nav>

        {!collapsed && (
          <div
            className={
              mode === 'landscape'
                ? 'pointer-events-auto flex h-full w-72 flex-col border-r border-neutral-800 bg-neutral-950'
                : 'pointer-events-auto flex max-h-[42dvh] w-full flex-col border border-neutral-800 border-b-0 bg-neutral-950 md:ml-20 md:max-h-full md:w-[var(--panel-w)] md:border-b md:border-l-0'
            }
          >
            <header className="flex shrink-0 items-center justify-between border-b border-primary bg-black px-3 py-1.5">
              <h2 className="font-monster text-xl uppercase tracking-wide text-white">{current.label}</h2>
              <button
                type="button"
                onClick={() => onPanelChange({ ...panel, collapsed: true })}
                aria-label="Fechar painel"
                aria-keyshortcuts="Escape"
                title={isTouch ? undefined : 'Fechar painel (Esc)'}
                className={`flex items-center justify-center border border-neutral-500 text-white transition-colors hover:border-primary hover:text-primary ${
                  isTouch ? 'size-12' : 'h-6 px-1.5 text-[10px] font-semibold uppercase tracking-wider'
                }`}
              >
                {isTouch ? <X size={14} aria-hidden /> : <span aria-hidden>Esc</span>}
              </button>
            </header>
            <EditorScroll>{content[group]}</EditorScroll>
          </div>
        )}
      </motion.div>
    </CompactContext.Provider>
  )
}
