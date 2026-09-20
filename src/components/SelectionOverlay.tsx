import { forwardRef, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from 'react'

/*
 * Overlay de interação: uma camada SVG independente, acima do canvas 3D. Hover, seleção, contorno e alças ficam AQUI, nunca na
 * CanvasTexture (nada disto pode aparecer numa exportação). O SVG é atualizado por atributo, direto no DOM, a cada frame pelo
 * ElementInteraction (sem re-render do React durante a câmera girar ou o arraste).
 *
 * As alças têm uma área de toque de 44 px (raio 22) mesmo com o desenho pequeno; o resto da camada não captura ponteiro.
 */

export type HandleKind = { type: 'scale'; corner: 0 | 1 | 2 | 3 } | { type: 'rotate' }

type ScreenPoint = { x: number; y: number }

export type OverlayFrame = {
  /** contornos em px da tela (atributo d do path); null = oculto */
  hover: string | null
  selected: string | null
  /** alças em px da tela; null = fora de vista */
  corners: readonly (ScreenPoint | null)[]
  rotate: ScreenPoint | null
  /** haste do centro-topo até a alça de rotação */
  stem: readonly [ScreenPoint, ScreenPoint] | null
  /** ex.: "32°", durante a rotação */
  label: string | null
}

export type OverlayHandle = { render: (frame: OverlayFrame) => void }

const HIT_RADIUS = 22
const COLOR = '#2563eb'
const CORNER_CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']

const SelectionOverlay = forwardRef<OverlayHandle, { onHandleDown: (kind: HandleKind, event: ReactPointerEvent) => void }>(
  function SelectionOverlay({ onHandleDown }, ref) {
    const hoverRef = useRef<SVGPathElement>(null)
    const selectedRef = useRef<SVGPathElement>(null)
    const stemRef = useRef<SVGLineElement>(null)
    const cornerRefs = useRef<(SVGGElement | null)[]>([])
    const rotateRef = useRef<SVGGElement>(null)
    const labelRef = useRef<SVGTextElement>(null)
    const last = useRef('')

    useImperativeHandle(ref, () => ({
      render(frame) {
        // não toca no DOM se nada mudou (o frame é recalculado a cada quadro)
        const signature = JSON.stringify(frame)
        if (signature === last.current) return
        last.current = signature

        const setPath = (element: SVGPathElement | null, d: string | null) => {
          if (!element) return
          element.setAttribute('d', d ?? '')
          element.style.display = d ? '' : 'none'
        }
        setPath(hoverRef.current, frame.hover)
        setPath(selectedRef.current, frame.selected)

        const place = (element: SVGGElement | null, point: ScreenPoint | null) => {
          if (!element) return
          element.style.display = point ? '' : 'none'
          if (point) element.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`)
        }
        frame.corners.forEach((point, i) => place(cornerRefs.current[i] ?? null, point))
        place(rotateRef.current, frame.rotate)

        const stem = stemRef.current
        if (stem) {
          stem.style.display = frame.stem ? '' : 'none'
          if (frame.stem) {
            stem.setAttribute('x1', frame.stem[0].x.toFixed(1))
            stem.setAttribute('y1', frame.stem[0].y.toFixed(1))
            stem.setAttribute('x2', frame.stem[1].x.toFixed(1))
            stem.setAttribute('y2', frame.stem[1].y.toFixed(1))
          }
        }

        const label = labelRef.current
        if (label) {
          label.style.display = frame.label && frame.rotate ? '' : 'none'
          if (frame.label && frame.rotate) {
            label.setAttribute('x', (frame.rotate.x + 16).toFixed(1))
            label.setAttribute('y', (frame.rotate.y - 12).toFixed(1))
            label.textContent = frame.label
          }
        }
      },
    }))

    const handleProps = (kind: HandleKind, cursor: string) => ({
      onPointerDown: (event: ReactPointerEvent) => onHandleDown(kind, event),
      style: { display: 'none', cursor, pointerEvents: 'all' as const, touchAction: 'none' as const },
    })

    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <path
          ref={hoverRef}
          fill="none"
          stroke={COLOR}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          opacity={0.75}
          style={{ display: 'none' }}
        />
        <path
          ref={selectedRef}
          fill="rgba(37, 99, 235, 0.06)"
          stroke={COLOR}
          strokeWidth={1.5}
          strokeLinejoin="round"
          style={{ display: 'none' }}
        />
        <line ref={stemRef} stroke={COLOR} strokeWidth={1.5} style={{ display: 'none' }} />

        {[0, 1, 2, 3].map((corner) => (
          <g
            key={corner}
            data-handle={`scale-${corner}`}
            ref={(element) => {
              cornerRefs.current[corner] = element
            }}
            {...handleProps({ type: 'scale', corner: corner as 0 | 1 | 2 | 3 }, CORNER_CURSORS[corner])}
          >
            <circle r={HIT_RADIUS} fill="transparent" />
            <rect x={-5} y={-5} width={10} height={10} rx={2} fill="#fff" stroke={COLOR} strokeWidth={1.5} />
          </g>
        ))}

        <g ref={rotateRef} data-handle="rotate" {...handleProps({ type: 'rotate' }, 'grab')}>
          <circle r={HIT_RADIUS} fill="transparent" />
          <circle r={6} fill="#fff" stroke={COLOR} strokeWidth={1.5} />
        </g>

        <text
          ref={labelRef}
          fill={COLOR}
          fontSize={12}
          fontWeight={700}
          paintOrder="stroke"
          stroke="#fff"
          strokeWidth={3}
          style={{ display: 'none' }}
        />
      </svg>
    )
  },
)

export default SelectionOverlay
