import { Download, LocateFixed, Maximize, Minimize, Minus, Mouse, MousePointerClick, Plus, Redo2, Rotate3d, Trash2, Undo2, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFullscreen } from './useFullscreen'
import { useIsTouch, useLayoutMode, type LayoutMode } from './useLayoutMode'
import { setViewInset } from './viewInset'

/** Botão quadrado da barra, com dica ao lado (aparece também no foco do teclado) */
function ControlButton({
  label,
  shortcut,
  icon: Icon,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string
  shortcut?: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  // aria-disabled (e não disabled) mantém o foco do teclado no botão ao atingir o limite
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) onClick()
        }}
        className={`flex h-11 w-11 pointer-coarse:h-12 pointer-coarse:w-12 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
          disabled
            ? 'cursor-not-allowed text-neutral-600'
            : danger
              ? 'text-neutral-300 hover:bg-red-600 hover:text-white'
              : 'text-neutral-300 hover:bg-primary hover:text-black'
        }`}
      >
        <Icon aria-hidden="true" size={19} strokeWidth={2} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 translate-x-1 whitespace-nowrap bg-black px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-white opacity-0 transition-all group-has-[:focus-visible]:translate-x-0 group-has-[:focus-visible]:opacity-100 group-hover:translate-x-0 group-hover:opacity-100"
      >
        {label}
        {shortcut && <span className="ml-2 text-primary">{shortcut}</span>}
      </span>
    </div>
  )
}

/** Botão da barra compacta (celular): 48px, sem dica (no toque não há hover; o menu "mais" mostra os rótulos) */
function CompactButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  /** ação destrutiva já armada (aguardando o segundo toque) */
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className={`flex size-12 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
        disabled ? 'text-neutral-600' : danger ? 'bg-red-600 text-white' : 'text-neutral-200 active:bg-primary active:text-black'
      }`}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={2} />
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-2 h-px bg-neutral-800" />

function Hint({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Icon aria-hidden="true" size={14} className="text-primary" />
      <span>{children}</span>
    </li>
  )
}

/** Dica de uso do mouse (no toque, quem ensina é o CoachMarks); some na primeira interação */
function Hints({ hidden, className }: { hidden: boolean; className: string }) {
  return (
    <ul
      className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 select-none flex-wrap justify-center gap-x-5 gap-y-1 border border-neutral-800 bg-black/75 px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-neutral-300 transition-all duration-700 ${className} ${
        hidden ? 'translate-y-2 opacity-0' : 'opacity-100'
      }`}
      style={{ clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' }}
    >
      <Hint icon={Rotate3d}>
        <b className="font-semibold text-white">Arraste</b> para girar
      </Hint>
      <Hint icon={Mouse}>
        <b className="font-semibold text-white">Scroll</b> para zoom
      </Hint>
      <Hint icon={MousePointerClick}>
        <b className="font-semibold text-white">Clique</b> para editar
      </Hint>
    </ul>
  )
}

/** Faixa de botões do celular: horizontal no topo (em pé) ou coluna à direita (deitado) */
function CompactBar({ mode, children }: { mode: LayoutMode; children: ReactNode }) {
  const landscape = mode === 'landscape'
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className={`pointer-events-none absolute z-10 flex ${landscape ? 'top-2 flex-col items-end gap-2' : 'inset-x-2 top-2 items-start justify-between'}`}
      style={landscape ? { right: 'max(0.5rem, env(safe-area-inset-right))' } : undefined}
    >
      {children}
    </motion.div>
  )
}

export default function ViewerControls({
  onZoomIn,
  onZoomOut,
  onReset,
  atMinZoom,
  atMaxZoom,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDownload,
  onResetAll,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  atMinZoom: boolean
  atMaxZoom: boolean
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onDownload: () => void
  /** recomeça do zero (pede confirmação, e pode ser desfeito) */
  onResetAll: () => void
}) {
  const isTouch = useIsTouch()
  const mode = useLayoutMode()
  const compact = mode !== 'desktop'
  const fullscreen = useFullscreen()

  // Recomeçar apaga tudo: o primeiro clique só arma o botão (3 s); o segundo confirma
  const [armed, setArmed] = useState(false)
  const armTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(armTimer.current), [])
  const resetAll = () => {
    if (!armed) {
      setArmed(true)
      armTimer.current = window.setTimeout(() => setArmed(false), 3000)
      return
    }
    window.clearTimeout(armTimer.current)
    setArmed(false)
    onResetAll()
  }

  // A barra compacta cobre uma faixa do palco: o enquadramento da lata a respeita
  useEffect(() => {
    setViewInset('toolbar', mode === 'sheet' ? { top: 56 } : mode === 'landscape' ? { right: 64 } : { right: 72 })
    return () => setViewInset('toolbar', null)
  }, [mode])

  // A dica de uso some na primeira interação com a lata (ela já cumpriu o papel)
  const [hintDismissed, setHintDismissed] = useState(false)
  useEffect(() => {
    if (hintDismissed) return
    const dismiss = () => setHintDismissed(true)
    window.addEventListener('pointerdown', dismiss, { once: true })
    window.addEventListener('wheel', dismiss, { once: true })
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('wheel', dismiss)
    }
  }, [hintDismissed])

  if (compact) {
    return (
      <>
        <CompactBar mode={mode}>
          <div className={`pointer-events-auto flex border border-neutral-800 bg-neutral-950 ${mode === 'landscape' ? 'flex-col' : ''}`}>
            <CompactButton label="Desfazer" icon={Undo2} onClick={onUndo} disabled={!canUndo} />
            <CompactButton label="Refazer" icon={Redo2} onClick={onRedo} disabled={!canRedo} />
          </div>
          <div className={`pointer-events-auto flex border border-neutral-800 bg-neutral-950 ${mode === 'landscape' ? 'flex-col' : ''}`}>
            <CompactButton label="Centralizar vista" icon={LocateFixed} onClick={onReset} />
            {fullscreen.supported && (
              <CompactButton
                label={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}
                icon={fullscreen.active ? Minimize : Maximize}
                onClick={fullscreen.toggle}
              />
            )}
            {/* Recomeçar apaga tudo: fica à vista (sem menu) e pede um segundo toque, com o aviso escrito ao lado */}
            <div className="relative">
              <CompactButton label={armed ? 'Toque de novo para apagar tudo' : 'Recomeçar'} icon={Trash2} onClick={resetAll} danger={armed} />
              {armed && (
                <p
                  role="status"
                  className={`pointer-events-none absolute z-20 w-60 bg-red-600 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-white ${mode === 'landscape' ? 'right-full top-0 mr-1' : 'right-0 top-full mt-1'}`}
                >
                  Toque de novo para apagar tudo
                </p>
              )}
            </div>
          </div>
        </CompactBar>

        {/* em paisagem baixa a dica cobriria a lata */}
        {!isTouch && mode !== 'landscape' && <Hints hidden={hintDismissed} className="top-16" />}
      </>
    )
  }

  return (
    <>
      {/* Barra vertical à direita, centrada na altura (como o painel à esquerda), com a borda de cima cortada na diagonal */}
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 md:right-4"
      >
        <div
          role="toolbar"
          aria-label="Controles do visualizador 3D"
          aria-orientation="vertical"
          className="pointer-events-auto flex flex-col border border-neutral-800 bg-neutral-950 py-1"
          style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}
        >
          <ControlButton label="Aproximar" icon={Plus} onClick={onZoomIn} disabled={atMinZoom} />
          <ControlButton label="Afastar" icon={Minus} onClick={onZoomOut} disabled={atMaxZoom} />
          <ControlButton label="Centralizar vista" icon={LocateFixed} onClick={onReset} />
          <Divider />
          <ControlButton label="Desfazer" shortcut="Ctrl+Z" icon={Undo2} onClick={onUndo} disabled={!canUndo} />
          <ControlButton label="Refazer" shortcut="Ctrl+Shift+Z" icon={Redo2} onClick={onRedo} disabled={!canRedo} />
          <Divider />
          <ControlButton label="Baixar imagem" icon={Download} onClick={onDownload} />
          <ControlButton
            label={armed ? 'Clique de novo para apagar tudo' : 'Recomeçar'}
            icon={Trash2}
            onClick={resetAll}
            danger={armed}
          />
        </div>
      </motion.div>

      {!isTouch && <Hints hidden={hintDismissed} className="bottom-5" />}
    </>
  )
}
