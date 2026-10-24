import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { InstancedMesh, Matrix3, Raycaster, Vector2, Vector3, type Mesh, type Object3D } from 'three'
import { TEXTURE_HEIGHT, TEXTURE_WIDTH, measureCanBodyUv } from './canArtwork'
import { elementCorners, hitTest, type InteractiveElement, type Point } from './canInteraction'
import { CAN_PARTS, type CanPart } from './canMaterials'
import { findPartMesh } from './canModel'
import { GROUPS, locate, type GroupId } from './editorNav'
import type { PartTagHandle } from './PartTag'
import { createSurfaceLookup, type SurfaceLookup } from './canSurface'
import { compositionToUv, uvToComposition, type BodyUvLayout } from './canUvLayout'
import type { OverlayHandle } from './SelectionOverlay'
import { haptic } from './useLayoutMode'

/*
 * Seleção por hover e toque sobre a lata. Vive dentro do <Canvas> (usa a câmera e a cena), não renderiza nada em 3D: o contorno é do
 * SelectionOverlay (SVG), atualizado aqui a cada frame.
 *
 * Não há arraste, escala nem rotação de elementos na lata: arrastar SEMPRE gira a câmera (OrbitControls). Os elementos são editados
 * pelo painel. Em vez de um contorno por elemento, a arte é tratada por região: tudo que é da Identidade (M, MONSTER, ENERGY) forma
 * uma só área, e o mesmo vale para os Textos; passar o mouse mostra o contorno da região e a etiqueta do grupo, e o clique abre o painel.
 *
 * Tela → elemento: pointer → raycast contra a lata (a interseção VISÍVEL mais próxima; se não for o corpo, é como se não
 * houvesse nada ali, então o lado de trás nunca é selecionado através da frente) → UV do GLB → composição (uvToComposition, o
 * inverso de projectToUv) → hitTest com os bounds reais.
 */

/** deslocamento máximo, em px de tela, para um toque/clique ainda contar como "tap" */
const TAP_SLOP = 12 // dedo é menos preciso que mouse: 12px ainda é um toque, não um arrasto
/** quanto tempo, em ms, o contorno e a etiqueta da região tocada ficam na tela (no toque não existe hover) */
const FLASH_MS = 1400
const SAMPLES_PER_EDGE = 24

/** Grupos cuja arte vira uma região única; nos demais (stickers, arte própria) cada elemento é a sua própria região */
const REGION_GROUPS: readonly GroupId[] = ['identity', 'text']

const groupLabel = (group: GroupId) => GROUPS.find((candidate) => candidate.id === group)?.label ?? ''

export default function ElementInteraction({
  elements,
  onSelect,
  onPart,
  partTagRef,
  overlayRef,
}: {
  elements: readonly InteractiveElement[]
  onSelect: (id: string | null) => void
  /** toque/clique numa parte da lata (lacre, corpo...) que não é um elemento editável */
  onPart: (part: CanPart) => void
  /** etiqueta com o nome da parte sob o ponteiro */
  partTagRef: RefObject<PartTagHandle | null>
  overlayRef: RefObject<OverlayHandle | null>
}) {
  const { gl, camera, scene, get, invalidate } = useThree()

  // o que os handlers (registrados uma vez) precisam ler sempre atualizado
  const live = useRef({ elements, onSelect, onPart })
  useEffect(() => {
    live.current = { elements, onSelect, onPart }
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

  /** A primeira interseção VISÍVEL sob a tela (qualquer parte da lata), ou null */
  const raycastCan = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    ndc.current.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.current.setFromCamera(ndc.current, camera)

    // tudo que pode tapar o corpo (tampa, lacre...), menos a condensação, que não é selecionável nem bloqueia
    const blockers: Mesh[] = []
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.visible && !(mesh instanceof InstancedMesh)) blockers.push(mesh)
    })
    return raycaster.current.intersectObjects(blockers, false)[0] ?? null
  }, [gl, camera, scene])

  /** Ponto da composição (px do canvas) sob a tela, ou null se o que está ali não é o corpo da lata */
  const pickComposition = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const target = getSurface()
      if (!target) return null
      const hit = raycastCan(clientX, clientY)
      if (!hit || hit.object !== target.mesh || !hit.uv) return null
      return uvToComposition(target.layout, hit.uv.x, hit.uv.y, TEXTURE_WIDTH, TEXTURE_HEIGHT)
    },
    [getSurface, raycastCan],
  )

  /** Parte da lata (corpo, tampa, fundo, lacre) sob a tela, ou null */
  const partMeshes = useRef<Map<Object3D, CanPart> | null>(null)
  const partAt = useCallback(
    (clientX: number, clientY: number): CanPart | null => {
      if (!partMeshes.current) {
        const map = new Map<Object3D, CanPart>()
        for (const part of Object.keys(CAN_PARTS) as CanPart[]) {
          const mesh = findPartMesh(scene, part)
          if (mesh) map.set(mesh, part)
        }
        if (map.size === 0) return null // o modelo ainda não carregou: tenta de novo na próxima
        partMeshes.current = map
      }
      const hit = raycastCan(clientX, clientY)
      return hit ? (partMeshes.current.get(hit.object) ?? null) : null
    },
    [scene, raycastCan],
  )

  const pending = useRef<{ pointerId: number; hitId: string | null; part: CanPart | null; x: number; y: number; moved: boolean } | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const hoverRequest = useRef(false)
  /** o contorno atual vem de um toque (não de hover): a etiqueta diz que o elemento foi selecionado */
  const flash = useRef(false)
  const flashTimer = useRef(0)
  /** elementos da região sob o ponteiro (vazio = nenhuma) */
  const hoverRegion = useRef<readonly string[]>([])
  const stageRef = useRef<HTMLElement | null>(null)

  /** O elemento editável sob a tela (a arte de fundo, que cobre a lata toda, não conta), ou null */
  const elementAt = useCallback(
    (clientX: number, clientY: number) => {
      const point = pickComposition(clientX, clientY)
      const element = point ? hitTest(live.current.elements, point) : null
      return element && !element.backdrop ? element : null
    },
    [pickComposition],
  )

  useEffect(() => {
    const stage = gl.domElement.closest<HTMLElement>('[data-can-stage]')
    if (!stage) return
    stageRef.current = stage

    // O OrbitControls segue sempre normal. Se o gesto terminar sem arrastar, é um tap → seleciona (ou desseleciona)
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (pending.current) {
        // um segundo dedo: quem quer beliscar/girar a lata é o OrbitControls
        pending.current = null
        return
      }
      const element = elementAt(event.clientX, event.clientY)
      const part = element ? null : partAt(event.clientX, event.clientY)
      pending.current = { pointerId: event.pointerId, hitId: element?.id ?? null, part, x: event.clientX, y: event.clientY, moved: false }
    }

    const onWindowMove = (event: PointerEvent) => {
      const tap = pending.current
      if (tap && tap.pointerId === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) {
        tap.moved = true
      }
    }

    const onWindowUp = (event: PointerEvent) => {
      const tap = pending.current
      if (!tap || tap.pointerId !== event.pointerId) return
      pending.current = null
      if (event.type === 'pointerup' && !tap.moved) {
        live.current.onSelect(tap.hitId)
        // toque numa parte da lata que não é um elemento (lacre, corpo...): abre os controles dela
        if (!tap.hitId && tap.part) live.current.onPart(tap.part)
        // no toque não há hover: o contorno e a etiqueta aparecem um instante no que foi tocado, e o aparelho vibra (onde existe)
        if (event.pointerType !== 'mouse' && (tap.hitId || tap.part)) {
          haptic()
          pointer.current = { x: tap.x, y: tap.y }
          hoverRequest.current = true
          flash.current = true
          invalidate()
          window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(clearHover, FLASH_MS)
        }
      }
    }

    // hover: só mouse, sem botão. Não é essencial a nenhuma função (toque não tem hover)
    const onStageMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) return
      flash.current = false
      pointer.current = { x: event.clientX, y: event.clientY }
      hoverRequest.current = true
      invalidate()
    }
    const clearHover = () => {
      window.clearTimeout(flashTimer.current)
      flash.current = false
      partTagRef.current?.hide()
      hoverRequest.current = false
      hoverRegion.current = []
      stage.style.cursor = ''
      invalidate()
    }
    const onStageLeave = (event: PointerEvent) => {
      // um dedo que sai do palco no meio do toque não deve apagar o contorno que o toque acabou de mostrar
      if (event.pointerType === 'mouse') clearHover()
    }

    // duplo clique sobre um elemento não deve resetar a câmera (o CameraRig faz isso em qualquer lugar vazio)
    const onDoubleClick = (event: MouseEvent) => {
      if (elementAt(event.clientX, event.clientY)) event.stopPropagation()
    }

    const cancel = () => {
      pending.current = null
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
      window.clearTimeout(flashTimer.current)
      cancel()
    }
  }, [gl, elementAt, partAt, invalidate, partTagRef])

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

  /** Região do grupo de um elemento: os elementos visíveis e editáveis que dividem o grupo (ou só ele, nos grupos sem região) */
  const regionOf = (element: InteractiveElement) => {
    const group = locate(element.id)?.group
    if (!group || !REGION_GROUPS.includes(group)) return { group, members: [element] }
    const members = live.current.elements.filter((candidate) => candidate.visible && !candidate.backdrop && locate(candidate.id)?.group === group)
    return { group, members }
  }

  /** Retângulo (sem rotação) que envolve todos os membros da região */
  const regionBox = (members: readonly InteractiveElement[]): InteractiveElement => {
    if (members.length === 1) return members[0]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const member of members) {
      for (const corner of elementCorners(member)) {
        minX = Math.min(minX, corner.x)
        minY = Math.min(minY, corner.y)
        maxX = Math.max(maxX, corner.x)
        maxY = Math.max(maxY, corner.y)
      }
    }
    return { ...members[0], center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, width: maxX - minX, height: maxY - minY, rotation: 0 }
  }

  useFrame(() => {
    if (hoverRequest.current) {
      hoverRequest.current = false
      const element = elementAt(pointer.current.x, pointer.current.y)
      const stage = stageRef.current
      const rect = stage?.getBoundingClientRect()
      if (element && stage && rect) {
        const { group, members } = regionOf(element)
        hoverRegion.current = members.map((member) => member.id)
        // a etiqueta nomeia o grupo (Identidade, Textos...); clicar abre os controles dele
        partTagRef.current?.show(group ? groupLabel(group) : element.label, pointer.current.x - rect.left, pointer.current.y - rect.top, flash.current ? 'selecionado' : undefined)
        stage.style.cursor = 'var(--cursor-pointer, pointer)'
      } else {
        hoverRegion.current = []
        // fora da arte, a etiqueta diz que parte da lata está sob o ponteiro (e clicar abre os controles dela)
        const part = partAt(pointer.current.x, pointer.current.y)
        if (part && stage && rect) {
          partTagRef.current?.show(CAN_PARTS[part].label, pointer.current.x - rect.left, pointer.current.y - rect.top, flash.current ? 'selecionado' : undefined)
        } else partTagRef.current?.hide()
        if (stage) stage.style.cursor = part ? 'var(--cursor-pointer, pointer)' : ''
      }
    }

    const overlay = overlayRef.current
    if (!overlay) return
    // a câmera já foi movida neste quadro (CameraRig/OrbitControls rodam antes); as matrizes só seriam atualizadas no render, depois
    camera.updateMatrixWorld()
    const all = live.current.elements
    const members = all.filter((element) => element.visible && hoverRegion.current.includes(element.id))

    overlay.render({ hover: members.length > 0 ? outline(regionBox(members)) : null })
  })

  return null
}
