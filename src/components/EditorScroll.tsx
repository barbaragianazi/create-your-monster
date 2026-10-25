import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/*
 * Área rolável do painel com barra própria: o navegador desenha a barra nativa e o cursor sobre ela não pode ser trocado por CSS (volta à
 * seta do Windows). Aqui a nativa fica escondida (.editor-scroll) e uma trilha fina em HTML, ao lado do conteúdo, mostra e controla a rolagem.
 */

const MIN_THUMB = 28

type Metrics = { top: number; height: number } | null

export default function EditorScroll({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<Metrics>(null)
  const drag = useRef<{ startY: number; startScroll: number } | null>(null)

  const measure = useCallback(() => {
    const el = scroller.current
    const trackEl = track.current
    if (!el || !trackEl) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb(null)
      return
    }
    const trackH = trackEl.clientHeight
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * trackH)
    const top = (scrollTop / (scrollHeight - clientHeight)) * (trackH - height)
    setThumb((prev) => (prev && prev.top === top && prev.height === height ? prev : { top, height }))
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    // seções que abrem/fecham mudam a altura do conteúdo sem mudar o tamanho do contêiner
    const mo = new MutationObserver(measure)
    mo.observe(el, { childList: true, subtree: true, attributes: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [measure])

  const scrollRatio = () => {
    const el = scroller.current!
    return (el.scrollHeight - el.clientHeight) / Math.max(1, track.current!.clientHeight - (thumb?.height ?? 0))
  }

  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, startScroll: scroller.current!.scrollTop }
  }

  const onThumbMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    scroller.current!.scrollTop = drag.current.startScroll + (e.clientY - drag.current.startY) * scrollRatio()
  }

  const onThumbUp = () => {
    drag.current = null
  }

  // clicar na trilha, fora da alça, leva a alça até ali (centrada no clique)
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !thumb) return
    const rect = e.currentTarget.getBoundingClientRect()
    const wanted = e.clientY - rect.top - thumb.height / 2
    scroller.current!.scrollTop = wanted * scrollRatio()
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div ref={scroller} onScroll={measure} className="editor-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div>{children}</div>
      </div>
      <div ref={track} onPointerDown={onTrackDown} aria-hidden className="editor-track relative w-2 shrink-0 bg-black">
        {thumb && (
          <div
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
            className="editor-thumb absolute inset-x-0 touch-none"
            style={{ top: thumb.top, height: thumb.height }}
          />
        )}
      </div>
    </div>
  )
}
