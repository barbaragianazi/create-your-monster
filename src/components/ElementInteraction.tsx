import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { InstancedMesh, Matrix3, Raycaster, Vector2, Vector3, type Mesh } from 'three'
import { TEXTURE_HEIGHT, TEXTURE_WIDTH, measureCanBodyUv } from './canArtwork'
import {
  angleAround,
  distanceFromCenter,
  elementCorners,
  hitTest,
  movePatch,
  rotationPatch,
  scalePatch,
  wrapDelta,
  type ElementPatch,
  type InteractiveElement,
  type Point,
} from './canInteraction'
import { findPartMesh } from './canModel'
import { createSurfaceLookup, type SurfaceLookup } from './canSurface'
import { compositionToUv, uvToComposition, type BodyUvLayout } from './canUvLayout'
import type { HandleKind, OverlayFrame, OverlayHandle } from './SelectionOverlay'

/*
 * Manipulação direta dos elementos sobre a lata: seleção, hover, arraste, escala e rotação. Vive dentro do <Canvas> (usa a
 * câmera e a cena), não renderiza nada em 3D: o desenho de contorno/alças é do SelectionOverlay (SVG), atualizado aqui a cada frame.
 *
 * Tela → elemento: pointer → raycast contra a lata (a interseção VISÍVEL mais próxima; se não for o corpo, é como se não
 * houvesse nada ali, então o lado de trás nunca é selecionado através da frente) → UV do GLB → composição (uvToComposition, o
 * inverso de projectToUv) → hitTest com os bounds reais. Durante o arraste o raycast se repete a cada frame e o elemento
 * acompanha a superfície.
 *
 * Só Pointer Events (mouse, toque, caneta). OrbitControls é desabilitado enquanto uma operação está ativa e SEMPRE reabilitado
 * ao terminar (pointerup, pointercancel, perda do foco, desmontagem).
 */

export type InteractionApi = { beginHandle: (kind: HandleKind, event: ReactPointerEvent) => void }

type Op =
  | { kind: 'move'; pointerId: number; element: InteractiveElement; start: Point }
  | { kind: 'scale'; pointerId: number; element: InteractiveElement; startDistance: number }
  | { kind: 'rotate'; pointerId: number; element: InteractiveElement; startAngle: number | null }

/** deslocamento máximo, em px de tela, para um toque/clique ainda contar como "tap" */
const TAP_SLOP = 6
const SAMPLES_PER_EDGE = 24
/** distância, em px de tela, da alça de rotação até a borda de cima */
const ROTATE_HANDLE_OFFSET = 34

type Controls = { enabled: boolean } | null

export default function ElementInteraction({
  elements,
  selectedId,
  onSelect,
  onChange,
  overlayRef,
  apiRef,
}: {
  elements: readonly InteractiveElement[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: ElementPatch) => void
  overlayRef: RefObject<OverlayHandle | null>
  apiRef: RefObject<InteractionApi | null>
}) {
  const { gl, camera, scene, get } = useThree()

  // o que os handlers (registrados uma vez) precisam ler sempre atualizado
  const live = useRef({ elements, selectedId, onSelect, onChange })
  useEffect(() => {
    live.current = { elements, selectedId, onSelect, onChange }
  })

  // O UV do corpo é só lido (o GLB não é alterado); o layout é o mesmo que a textura usa para reprojetar a composição
  const surface = useRef<{ mesh: Mesh; lookup: SurfaceLookup; layout: BodyUvLayout } | null>(null)
  const getSurface = useCallback(() => {
    if (!surface.current) {
      const mesh = findPartMesh(scene, 'body')
      if (mesh) surface.current = { mesh, lookup: createSurfaceLookup(mesh.geometry), layout: measureCanBodyUv(mesh.geometry) }
    }
    return surface.current
  }, [scene])

  const raycaster = useRef(new Raycaster())
  const ndc = useRef(new Vector2())

  /** Ponto da composição (px do canvas) sob a tela, ou null se o que está ali não é o corpo da lata */
  const pickComposition = useCallback((clientX: number, clientY: number): Point | null => {
    const target = getSurface()
    if (!target) return null
    const rect = gl.domElement.getBoundingClientRect()
    ndc.current.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.current.setFromCamera(ndc.current, camera)

    // tudo que pode tapar o corpo (tampa, lacre...), menos a condensação, que não é selecionável nem bloqueia
    const blockers: Mesh[] = []
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.visible && !(mesh instanceof InstancedMesh)) blockers.push(mesh)
    })
    const hit = raycaster.current.intersectObjects(blockers, false)[0]
    if (!hit || hit.object !== target.mesh || !hit.uv) return null
    return uvToComposition(target.layout, hit.uv.x, hit.uv.y, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  }, [gl, camera, scene, getSurface])

  const op = useRef<Op | null>(null)
  const pending = useRef<{ pointerId: number; hitId: string | null; x: number; y: number; moved: boolean } | null>(null)
  const pointer = useRef({ x: 0, y: 0, dirty: false })
  const hoverRequest = useRef(false)
  const hoverId = useRef<string | null>(null)
  const rotationLabel = useRef<number | null>(null)
  const controlsDisabled = useRef(false)
  const stageRef = useRef<HTMLElement | null>(null)

  const disableControls = useCallback(() => {
    const controls = get().controls as Controls
    if (controls?.enabled) {
      controls.enabled = false
      controlsDisabled.current = true
    }
  }, [get])
  const enableControls = useCallback(() => {
    // só reabilita o que ESTE módulo desabilitou
    if (!controlsDisabled.current) return
    controlsDisabled.current = false
    const controls = get().controls as Controls
    if (controls) controls.enabled = true
  }, [get])
  const endOp = useCallback(() => {
    op.current = null
    rotationLabel.current = null
    if (stageRef.current) stageRef.current.style.cursor = ''
    enableControls()
  }, [enableControls])

  const startOp = useCallback((next: Op, clientX: number, clientY: number) => {
    op.current = next
    pointer.current = { x: clientX, y: clientY, dirty: false }
    disableControls()
    if (stageRef.current) stageRef.current.style.cursor = 'grabbing'
  }, [disableControls])

  useEffect(() => {
    const stage = gl.domElement.closest<HTMLElement>('[data-can-stage]')
    if (!stage) return
    stageRef.current = stage

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (op.current) {
        // um segundo dedo: quem quer beliscar/girar a lata é o OrbitControls
        endOp()
        return
      }

      const point = pickComposition(event.clientX, event.clientY)
      const element = point ? hitTest(live.current.elements, point) : null
      const isSelected = element !== null && element.id === live.current.selectedId
      // mouse/caneta: arrasta na hora (Figma/Canva). Toque: só arrasta o que já está selecionado (arrastar fora gira a lata).
      // Camada de fundo (custom artwork, que cobre a lata toda): só arrasta quando já selecionada, em qualquer dispositivo
      const grabs = element !== null && point !== null && (isSelected || (event.pointerType !== 'touch' && !element.backdrop))

      if (grabs && element && point) {
        event.stopPropagation() // o OrbitControls não chega a ver este pointerdown
        event.preventDefault()
        if (!isSelected) live.current.onSelect(element.id)
        try {
          gl.domElement.setPointerCapture(event.pointerId)
        } catch {
          /* sem captura: os listeners da janela ainda recebem */
        }
        startOp({ kind: 'move', pointerId: event.pointerId, element, start: point }, event.clientX, event.clientY)
        return
      }

      // não é uma manipulação: o OrbitControls segue normal. Se terminar sem arrastar, é um tap → seleciona (ou desseleciona)
      pending.current = { pointerId: event.pointerId, hitId: element?.id ?? null, x: event.clientX, y: event.clientY, moved: false }
    }

    const onWindowMove = (event: PointerEvent) => {
      const tap = pending.current
      if (tap && tap.pointerId === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) {
        tap.moved = true
      }
      if (op.current && op.current.pointerId === event.pointerId) {
        pointer.current = { x: event.clientX, y: event.clientY, dirty: true }
      }
    }

    const onWindowUp = (event: PointerEvent) => {
      const tap = pending.current
      if (tap && tap.pointerId === event.pointerId) {
        pending.current = null
        if (event.type === 'pointerup' && !tap.moved) live.current.onSelect(tap.hitId)
      }
      if (op.current && op.current.pointerId === event.pointerId) endOp()
    }

    // hover: só mouse, sem botão. Não é essencial a nenhuma função (toque não tem hover)
    const onStageMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0 || op.current) return
      pointer.current = { x: event.clientX, y: event.clientY, dirty: false }
      hoverRequest.current = true
    }
    const onStageLeave = () => {
      hoverRequest.current = false
      hoverId.current = null
      if (!op.current) stage.style.cursor = ''
    }

    // duplo clique sobre um elemento não deve resetar a câmera (o CameraRig faz isso em qualquer lugar vazio)
    const onDoubleClick = (event: MouseEvent) => {
      const point = pickComposition(event.clientX, event.clientY)
      if (point && hitTest(live.current.elements, point)) event.stopPropagation()
    }

    const cancel = () => {
      pending.current = null
      endOp()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') live.current.onSelect(null)
    }

    stage.addEventListener('pointerdown', onPointerDown, { capture: true })
    stage.addEventListener('dblclick', onDoubleClick, { capture: true })
    stage.addEventListener('pointermove', onStageMove)
    stage.addEventListener('pointerleave', onStageLeave)
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown, { capture: true })
      stage.removeEventListener('dblclick', onDoubleClick, { capture: true })
      stage.removeEventListener('pointermove', onStageMove)
      stage.removeEventListener('pointerleave', onStageLeave)
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('pointerup', onWindowUp)
      window.removeEventListener('pointercancel', onWindowUp)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', onKeyDown)
      cancel() // nunca deixa o OrbitControls desabilitado
    }
  }, [gl, pickComposition, startOp, endOp])

  // Alças: começam no pointerdown do overlay (SVG), que não passa pelo stage
  useEffect(() => {
    apiRef.current = {
      beginHandle(kind, event) {
        const native = event.nativeEvent
        if (native.pointerType === 'mouse' && native.button !== 0) return
        const element = live.current.elements.find((candidate) => candidate.id === live.current.selectedId)
        if (!element || !element.visible) return
        event.preventDefault()
        event.stopPropagation()
        if (op.current) endOp()
        try {
          ;(event.currentTarget as Element).setPointerCapture(native.pointerId)
        } catch {
          /* sem captura: os listeners da janela ainda recebem */
        }

        const start = pickComposition(native.clientX, native.clientY)
        if (kind.type === 'scale') {
          const nominal = Math.hypot(element.width / 2, element.height / 2)
          const measured = start ? distanceFromCenter(element, start) : nominal
          startOp(
            { kind: 'scale', pointerId: native.pointerId, element, startDistance: measured > 8 ? measured : nominal },
            native.clientX,
            native.clientY,
          )
        } else {
          rotationLabel.current = element.rotation
          startOp(
            { kind: 'rotate', pointerId: native.pointerId, element, startAngle: start ? angleAround(element, start) : null },
            native.clientX,
            native.clientY,
          )
        }
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, pickComposition, startOp, endOp])

  // --- Overlay: composição → superfície → tela ---------------------------------------------------------------------
  const scratch = useRef({ world: new Vector3(), normal: new Vector3(), view: new Vector3(), matrix: new Matrix3() })

  /** Ponto da composição na tela; null se fora da malha, atrás da câmera ou virado para longe (parte de trás da lata) */
  const project = (point: Point): Point | null => {
    const target = getSurface()
    if (!target) return null
    const { u, v } = compositionToUv(target.layout, point.x, point.y, TEXTURE_WIDTH, TEXTURE_HEIGHT)
    const hit = target.lookup.locate(u, v)
    if (!hit) return null

    const { world, normal, view, matrix } = scratch.current
    world.copy(hit.position).applyMatrix4(target.mesh.matrixWorld)
    normal.copy(hit.normal).applyNormalMatrix(matrix.getNormalMatrix(target.mesh.matrixWorld)).normalize()
    view.copy(camera.position).sub(world)
    if (normal.dot(view) <= 0) return null
    world.project(camera)
    if (world.z > 1) return null
    const { width, height } = get().size
    return { x: (world.x * 0.5 + 0.5) * width, y: (-world.y * 0.5 + 0.5) * height }
  }

  const outline = (element: InteractiveElement) => {
    const corners = elementCorners(element)
    let d = ''
    let drawing = false
    let allVisible = true
    for (let edge = 0; edge < 4; edge++) {
      const from = corners[edge]
      const to = corners[(edge + 1) % 4]
      for (let k = 0; k < SAMPLES_PER_EDGE; k++) {
        const t = k / SAMPLES_PER_EDGE
        const screen = project({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
        if (!screen) {
          drawing = false
          allVisible = false
          continue
        }
        d += `${drawing ? 'L' : 'M'}${screen.x.toFixed(1)} ${screen.y.toFixed(1)}`
        drawing = true
      }
    }
    return allVisible ? `${d}Z` : d
  }

  const change = (id: string, patch: ElementPatch) => live.current.onChange(id, patch)

  useFrame(() => {
    const current = op.current
    if (current && pointer.current.dirty) {
      pointer.current.dirty = false
      const point = pickComposition(pointer.current.x, pointer.current.y)
      if (point) {
        const { element } = current
        if (current.kind === 'move') {
          change(element.id, movePatch(element, wrapDelta(point.x - current.start.x), point.y - current.start.y))
        } else if (current.kind === 'scale') {
          const factor = distanceFromCenter(element, point) / current.startDistance
          change(element.id, scalePatch(element, Math.min(20, Math.max(0.05, factor))))
        } else {
          const degrees =
            current.startAngle === null
              ? angleAround(element, point) + 90 // sem ponto inicial: a alça fica na direção "para cima" do elemento
              : element.rotation + (((angleAround(element, point) - current.startAngle + 540) % 360) - 180)
          const patch = rotationPatch(element, degrees)
          rotationLabel.current = patch.rotation ?? element.rotation
          change(element.id, patch)
        }
      }
    } else if (!current && hoverRequest.current) {
      hoverRequest.current = false
      const point = pickComposition(pointer.current.x, pointer.current.y)
      const element = point ? hitTest(live.current.elements, point) : null
      // a custom artwork cobre a lata inteira: destacá-la no hover só atrapalharia
      hoverId.current = element && !element.backdrop ? element.id : null
      if (stageRef.current) stageRef.current.style.cursor = element && !element.backdrop ? 'move' : ''
    }

    const overlay = overlayRef.current
    if (!overlay) return
    // a câmera já foi movida neste quadro (CameraRig/OrbitControls rodam antes); as matrizes só seriam atualizadas no render, depois
    camera.updateMatrixWorld()
    const { elements: all, selectedId: selected } = live.current
    const selectedElement = all.find((element) => element.id === selected && element.visible) ?? null
    const hovered =
      hoverId.current && hoverId.current !== selected ? all.find((element) => element.id === hoverId.current && element.visible) : null

    const frame: OverlayFrame = {
      hover: hovered ? outline(hovered) : null,
      selected: selectedElement ? outline(selectedElement) : null,
      corners: [null, null, null, null],
      rotate: null,
      stem: null,
      label: null,
    }

    if (selectedElement) {
      const corners = elementCorners(selectedElement)
      const mutableCorners = corners.map((corner) => project(corner))
      const top = project({ x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 })
      const center = project(selectedElement.center)
      let rotate: Point | null = null
      let stem: OverlayFrame['stem'] = null
      if (top) {
        // a alça de rotação fica um deslocamento FIXO em px da tela para fora da borda de cima, qualquer que seja o zoom
        const direction = center ? { x: top.x - center.x, y: top.y - center.y } : { x: 0, y: -1 }
        const length = Math.hypot(direction.x, direction.y) || 1
        rotate = { x: top.x + (direction.x / length) * ROTATE_HANDLE_OFFSET, y: top.y + (direction.y / length) * ROTATE_HANDLE_OFFSET }
        stem = [top, rotate]
      }
      frame.corners = mutableCorners
      frame.rotate = rotate
      frame.stem = stem
      frame.label = current?.kind === 'rotate' && rotationLabel.current !== null ? `${Math.round(rotationLabel.current)}°` : null
    }
    overlay.render(frame)
  })

  return null
}
