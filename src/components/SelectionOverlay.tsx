import { forwardRef, useImperativeHandle, useRef } from 'react'

/*
 * Overlay de interação: uma camada SVG independente, acima do canvas 3D. O contorno de hover fica AQUI, nunca na CanvasTexture
 * (nada disto pode aparecer numa exportação). O SVG é atualizado por atributo, direto no DOM, a cada frame pelo ElementInteraction
 * (sem re-render do React durante a câmera girar). A camada não captura ponteiro: arrastar sempre gira a lata.
 */

export type OverlayFrame = {
  /** contorno da região sob o ponteiro, em px da tela (atributo d do path); null = oculto */
  hover: string | null
}

export type OverlayHandle = { render: (frame: OverlayFrame) => void }

const COLOR = '#80e100'

const SelectionOverlay = forwardRef<OverlayHandle>(function SelectionOverlay(_, ref) {
  const hoverRef = useRef<SVGPathElement>(null)
  const last = useRef<string | null>('')

  useImperativeHandle(ref, () => ({
    render({ hover }) {
      // não toca no DOM se nada mudou (o frame é recalculado a cada quadro)
      if (hover === last.current) return
      last.current = hover
      const path = hoverRef.current
      if (!path) return
      path.setAttribute('d', hover ?? '')
      path.style.display = hover ? '' : 'none'
    },
  }))

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      <path
        ref={hoverRef}
        fill="rgba(128, 225, 0, 0.06)"
        stroke={COLOR}
        strokeWidth={1.5}
        strokeDasharray="5 4"
        strokeLinejoin="round"
        opacity={0.85}
        style={{ display: 'none' }}
      />
    </svg>
  )
})

export default SelectionOverlay
