import { X } from 'lucide-react'
import { animate, motion, useMotionValue } from 'motion/react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import EditorScroll from './EditorScroll'
import { useParentSize } from './useParentSize'
import { setViewInset } from './viewInset'

/*
 * Gaveta de edição do celular em pé: as abas ficam fixas embaixo e o painel sobe por cima delas em três posições (recolhido, metade e
 * cheio). Arrastar a alça/título move a gaveta com o dedo e solta na posição mais próxima (ou na que o gesto "jogou"); tocar na alça
 * alterna metade/cheio. A altura é um motion value (nada re-renderiza durante o arrasto) e é publicada no viewInset a cada mudança,
 * para o CameraRig manter a lata centrada na parte do palco que a gaveta não cobre.
 */

type Snap = 'half' | 'full'

const SPRING = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const
/** deslocamento (px) a partir do qual o gesto na alça deixa de ser um toque */
const DRAG_SLOP = 5
/** velocidade (px/ms) a partir da qual soltar é um "arremesso" */
const FLING = 0.55

export default function BottomSheet({
  open,
  onOpenChange,
  title,
  tabs,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** barra de abas, fixa embaixo da gaveta */
  tabs: ReactNode
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLDivElement>(null)
  const { height: stageHeight } = useParentSize(root)
  const [navHeight, setNavHeight] = useState(56)
  const [snap, setSnap] = useState<Snap>('half')
  // a gaveta continua montada enquanto recolhe, para a animação de fechar aparecer
  const [rendered, setRendered] = useState(open)
  const height = useMotionValue(0)

  useEffect(() => {
    const element = nav.current
    if (!element) return
    const measure = () => setNavHeight(element.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const available = Math.max(0, stageHeight - navHeight)
  const heights = {
    // em telas baixas (celular pequeno) a gaveta recolhida pela metade deixa a lata aparecer; de 600px de altura para cima ela
    // ganha espaço para mostrar o título da seção e alguns controles sem precisar expandir
    half: Math.round(
      stageHeight < 560
        ? available * 0.35
        : Math.min(available * 0.7, Math.max(stageHeight >= 600 ? 230 : 170, stageHeight * (stageHeight >= 600 ? 0.36 : 0.3))),
    ),
    full: Math.max(0, available - 10),
  }

  useEffect(() => {
    if (!stageHeight) return
    if (open) {
      setRendered(true)
      const controls = animate(height, snap === 'full' ? Math.max(heights.half, heights.full) : heights.half, SPRING)
      return () => controls.stop()
    }
    const controls = animate(height, 0, { ...SPRING, onComplete: () => setRendered(false) })
    return () => controls.stop()
    // as alturas derivam de stageHeight e navHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snap, stageHeight, navHeight, height])

  useEffect(() => {
    const update = () => setViewInset('sheet', { bottom: navHeight + height.get() })
    update()
    const stop = height.on('change', update)
    return () => {
      stop()
      setViewInset('sheet', null)
    }
  }, [height, navHeight])

  const drag = useRef<{ startY: number; startHeight: number; lastY: number; lastTime: number; velocity: number; moved: boolean; onHandle: boolean } | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startY: event.clientY, startHeight: height.get(), lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false, onHandle: !!(event.target as HTMLElement).closest('[data-handle]') }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current
    if (!gesture) return
    const delta = event.clientY - gesture.startY
    if (!gesture.moved && Math.abs(delta) < DRAG_SLOP) return
    gesture.moved = true
    const elapsed = event.timeStamp - gesture.lastTime
    if (elapsed > 0) gesture.velocity = (event.clientY - gesture.lastY) / elapsed
    gesture.lastY = event.clientY
    gesture.lastTime = event.timeStamp
    // além do limite, a gaveta resiste (não segue o dedo por inteiro)
    const raw = gesture.startHeight - delta
    const max = heights.full
    height.set(raw > max ? max + (raw - max) * 0.25 : Math.max(0, raw))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current
    drag.current = null
    if (!gesture || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!gesture.moved) {
      // com o ponteiro capturado o clique não chega ao botão da alça: o toque nela é resolvido aqui
      if (gesture.onHandle && event.type === 'pointerup') toggleSize()
      return
    }

    const current = height.get()
    const { half, full } = heights
    let target: 'closed' | Snap
    if (gesture.velocity > FLING) target = current > (half + full) / 2 ? 'half' : 'closed' // arremessou para baixo
    else if (gesture.velocity < -FLING) target = current < half * 0.8 ? 'half' : 'full' // arremessou para cima
    else {
      const options: [number, 'closed' | Snap][] = [[0, 'closed'], [half, 'half'], [full, 'full']]
      target = options.reduce((best, option) => (Math.abs(option[0] - current) < Math.abs(best[0] - current) ? option : best))[1]
    }

    if (target === 'closed') onOpenChange(false)
    else {
      setSnap(target)
      animate(height, heights[target], SPRING) // o efeito não roda se a posição não mudou
    }
  }

  const toggleSize = () => {
    setSnap((previous) => (previous === 'half' ? 'full' : 'half'))
  }

  return (
    <div ref={root} className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col">
      {rendered && (
        <motion.section
          aria-label={title}
          style={{ height }}
          className="pointer-events-auto flex flex-col overflow-hidden border-t-2 border-primary bg-neutral-950"
        >
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="shrink-0 touch-none select-none border-b border-neutral-800 bg-black"
          >
            <div className="flex items-center justify-between pl-4 pr-1">
              <button
                type="button"
                data-handle
                // só o teclado (detail 0) chega aqui; o toque é tratado no pointerup da gaveta
                onClick={(event) => event.detail === 0 && toggleSize()}
                aria-label={snap === 'half' ? 'Expandir painel' : 'Reduzir painel'}
                className="flex h-12 min-w-0 flex-1 items-center text-left"
              >
                <h2 className="font-monster text-2xl uppercase tracking-wide text-white">{title}</h2>
              </button>
              <button
                type="button"
                data-no-drag
                onClick={() => onOpenChange(false)}
                aria-label="Fechar painel"
                className="flex size-12 items-center justify-center text-white active:text-primary"
              >
                <X size={22} aria-hidden />
              </button>
            </div>
          </div>
          <EditorScroll>{children}</EditorScroll>
        </motion.section>
      )}
      <div ref={nav} className="pointer-events-auto border-t border-neutral-800 bg-black safe-bottom safe-x">
        {tabs}
      </div>
    </div>
  )
}
