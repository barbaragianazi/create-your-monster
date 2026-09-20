import { Hand, Minus, Mouse, Plus, RotateCcw, Rotate3d, type LucideIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'

const COARSE_POINTER = '(pointer: coarse)'

function subscribeToPointerType(callback: () => void) {
  const query = window.matchMedia(COARSE_POINTER)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function useIsTouch() {
  return useSyncExternalStore(
    subscribeToPointerType,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  )
}

const BUTTON_CLASS =
  'flex h-11 w-11 items-center justify-center text-neutral-800 transition-colors hover:bg-neutral-900/10 ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-900 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:text-neutral-400 aria-disabled:hover:bg-transparent'

function ControlButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
}) {
  // aria-disabled (e não disabled) mantém o foco do teclado no botão ao atingir o limite
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className={BUTTON_CLASS}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={2} />
    </button>
  )
}

export default function ViewerControls({
  onZoomIn,
  onZoomOut,
  onReset,
  atMinZoom,
  atMaxZoom,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  atMinZoom: boolean
  atMaxZoom: boolean
}) {
  const isTouch = useIsTouch()
  const hints: { icon: LucideIcon; text: string }[] = [
    { icon: Rotate3d, text: 'Arraste para girar' },
    isTouch ? { icon: Hand, text: 'Pinça para zoom' } : { icon: Mouse, text: 'Scroll para zoom' },
  ]

  return (
    <>
      {/* Coluna centralizada: o grupo fica à direita da lata, entre a lata e o painel DEV */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto flex w-full max-w-md -translate-y-1/2 justify-end px-4">
        <div
          role="group"
          aria-label="Controles do visualizador 3D"
          className="pointer-events-auto flex flex-col divide-y divide-neutral-900/10 overflow-hidden rounded-xl bg-white/80 shadow"
        >
          <ControlButton label="Aproximar lata" icon={Plus} onClick={onZoomIn} disabled={atMinZoom} />
          <ControlButton label="Afastar lata" icon={Minus} onClick={onZoomOut} disabled={atMaxZoom} />
          <ControlButton label="Redefinir visualização" icon={RotateCcw} onClick={onReset} />
        </div>
      </div>

      <ul className="pointer-events-none absolute inset-x-0 bottom-4 flex select-none justify-center gap-4 px-4 text-xs text-neutral-500">
        {hints.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-1.5">
            <Icon aria-hidden="true" size={14} />
            {text}
          </li>
        ))}
      </ul>
    </>
  )
}
