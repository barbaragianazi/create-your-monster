import { Canvas, useThree } from '@react-three/fiber'
import { AdditiveBlending, Box3, CanvasTexture, Color, Vector2, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import StageBackdrop from './StageBackdrop'
import { exportImage, type CaptureCan, type ExportOptions } from './exportImage'
import type { BackdropColors, BackdropId } from './stageBackdrops'
import { Center, Environment, Lightformer, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { applyArtworkTexture, measureCanBodyUv, type ArtworkConfig } from './canArtwork'
import type { CondensationConfig } from './canCondensation'
import Condensation from './Condensation'
import SealCustomization from './SealCustomization'
import type { SealCustomization as SealCustomizationConfig } from './sealStyle'
import type { CustomArtwork } from './canCustomArtworkLayer'
import type { PatternConfig } from './canPattern'
import type { SugarConfig } from './canSugarLabel'
import type { Sticker } from './canStickers'
import type { TextsConfig } from './canText'
import CameraRig, { type ViewApi, type ZoomState } from './CameraRig'
import AdaptiveQuality, { type QualityLevel } from './AdaptiveQuality'
import PartTag, { type PartTagHandle } from './PartTag'
import ViewerControls from './ViewerControls'
import CoachMarks from './CoachMarks'
import { isCoarsePointer } from './useLayoutMode'
import ElementInteraction from './ElementInteraction'
import SelectionOverlay, { type OverlayHandle } from './SelectionOverlay'
import type { InteractiveElement } from './canInteraction'
import { CAMERA_FOV, INITIAL_CAMERA_POSITION } from './viewerConfig'
import { findPartMesh, prepareCanScene } from './canModel'
import { IDENTITY_UV_LAYOUT } from './canUvLayout'
import { applyBodyFinish } from './canShoulderFinish'
import { resolveShoulderColor, resolveShoulderFinish } from './canShoulder'
import { useArtworkTexture } from './useArtworkTexture'
import { useShoulderFinishTarget } from './useShoulderFinishTarget'
import { CAN_FINISHES, CAN_PARTS, type CanConfig, type CanPart } from './canMaterials'

const MODEL_URL = '/models/monster-can.glb'

// Sem WebGL (aceleração de hardware desligada ou GPU bloqueada no navegador) o 3D não existe: em vez do palco vazio, um aviso
function detectWebGL() {
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // devolve o contexto de teste
    return !!gl
  } catch {
    return false
  }
}

function NoWebGL() {
  return (
    <div role="alert" className="absolute inset-0 flex items-center justify-center px-6">
      <div className="max-w-sm border border-primary bg-black/90 p-4 text-sm leading-relaxed text-neutral-300">
        <p className="font-monster text-2xl uppercase leading-none tracking-wide text-white">Não foi possível exibir a lata</p>
        <p className="mt-2">Este navegador está com o 3D (WebGL) desativado. Ative a aceleração de hardware nas configurações do navegador (Sistema) e reinicie-o, ou abra o site em outro navegador.</p>
      </div>
    </div>
  )
}

function Can({
  config,
  pattern,
  customArtwork,
  stickers,
  artwork,
  texts,
  condensation,
  sugar,
  sealCustom,
  quality,
}: {
  config: CanConfig
  pattern: PatternConfig
  customArtwork: CustomArtwork | null
  stickers: readonly Sticker[]
  artwork: ArtworkConfig
  texts: TextsConfig
  condensation: CondensationConfig
  sugar: SugarConfig
  sealCustom: SealCustomizationConfig
  quality: QualityLevel
}) {
  const { scene } = useGLTF(MODEL_URL)
  // O UV do corpo é só lido: a textura é reprojetada para ele (ver canUvLayout), o GLB não é alterado
  const uvLayout = useMemo(() => {
    const body = findPartMesh(scene, 'body')
    return body ? measureCanBodyUv(body.geometry) : IDENTITY_UV_LAYOUT
  }, [scene])
  const shoulderColor = resolveShoulderColor(config.shoulder)
  const artworkTexture = useArtworkTexture(config.body.fill, shoulderColor, pattern, customArtwork, stickers, artwork, texts, sugar, uvLayout)
  const finishTarget = useShoulderFinishTarget(uvLayout)

  const materials = useMemo(() => prepareCanScene(scene), [scene])

  // Cada região tem seu próprio material no GLB, então cor e acabamento são independentes
  useEffect(() => {
    for (const part of Object.keys(CAN_PARTS) as CanPart[]) {
      const material = materials[part]
      if (!material) continue
      // Corpo: a cor é o fundo da textura (canvas), então o material fica branco para não tingir a arte;
      // o acabamento dele (e o do ombro, que é parte do mesmo material) é aplicado no effect abaixo
      if (part === 'body') {
        material.color.set('#ffffff')
        continue
      }
      material.color.set(config[part].color)
      material.setValues(CAN_FINISHES[config[part].finish])
    }
  }, [materials, config])

  const bodyFinish = config.body.finish
  const shoulderFinish = resolveShoulderFinish(config.shoulder, bodyFinish)
  useEffect(() => {
    if (materials.body) applyBodyFinish(materials.body, finishTarget, bodyFinish, shoulderFinish)
  }, [materials, finishTarget, bodyFinish, shoulderFinish])

  useEffect(() => {
    if (materials.body) applyArtworkTexture(materials.body, artworkTexture)
  }, [materials, artworkTexture])

  return (
    <>
      <Center>
        <primitive object={scene} />
      </Center>
      <FloorShadow scene={scene} glowColor={artwork.m.color} />
      <SealCustomization scene={scene} sealColor={config.seal.color} customization={sealCustom} />
      <Condensation
        scene={scene}
        config={condensation}
        coveredOpening={sealCustom.style === 'custom'}
        amountScale={quality >= 2 ? 0.5 : 1}
      />
    </>
  )
}

// A cena é estática até algo mudar: o Canvas só desenha sob demanda (frameloop="demand"). Cada render do CanViewer (qualquer estado
// novo: cor, texto, seleção...) pede um quadro; câmera, interação e texturas assíncronas pedem o seu. Parada, a lata não gasta GPU.
function DrawOnChange() {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    invalidate()
  })
  return null
}

// Sombra de contato + brilho verde no chão, sob a lata: dois planos com textura de gradiente (criada uma vez). Sem sombra de verdade,
// então não custa nada por quadro. Não recebem raycast (cliques passam) e só aparecem de cima (o plano olha para +Y).
function radialTexture(stops: [number, string][]) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    for (const [at, color] of stops) gradient.addColorStop(at, color)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
  }
  return new CanvasTexture(canvas)
}

function FloorShadow({ scene, glowColor }: { scene: Object3D; glowColor: string }) {
  const floorY = useMemo(() => -new Box3().setFromObject(scene).getSize(new Vector3()).y / 2, [scene])
  const shadow = useMemo(() => radialTexture([[0, 'rgba(0,0,0,0.9)'], [0.4, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]), [])
  // Brilho na cor do M do logo, mais fraco para não roubar o cenário
  const glow = useMemo(() => {
    const c = new Color(glowColor)
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
    return radialTexture([[0, `rgba(${rgb},0.26)`], [0.45, `rgba(${rgb},0.08)`], [1, `rgba(${rgb},0)`]])
  }, [glowColor])
  useEffect(
    () => () => {
      shadow.dispose()
      glow.dispose()
    },
    [shadow, glow],
  )
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={floorY - 0.004} scale={[6.4, 6.4, 1]} renderOrder={-2} raycast={() => null}>
        <planeGeometry />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={floorY - 0.002} scale={[3.4, 3.4, 1]} renderOrder={-1} raycast={() => null}>
        <planeGeometry />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}

// Exportar a imagem: redimensiona o canvas para o tamanho final, desenha um quadro, lê o canvas na mesma tarefa (sem
// preserveDrawingBuffer) e devolve tudo ao tamanho da tela. O fundo é transparente (PNG com alfa); o fundo do palco entra depois.
function CaptureBridge({ captureRef }: { captureRef: RefObject<CaptureCan | null> }) {
  const { gl, scene, camera, invalidate } = useThree()
  useEffect(() => {
    captureRef.current = (width, height) => {
      const view = camera as PerspectiveCamera
      const previousSize = gl.getSize(new Vector2())
      const previousRatio = gl.getPixelRatio()
      const previousAspect = view.aspect
      // o recuo da interface (gaveta, abas) desloca o enquadramento só na tela: a imagem exportada é centrada no quadro inteiro
      const previousView = view.view?.enabled ? { ...view.view } : null
      try {
        gl.setPixelRatio(1)
        gl.setSize(width, height, false)
        view.aspect = width / height
        view.clearViewOffset()
        view.updateProjectionMatrix()
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      } finally {
        gl.setPixelRatio(previousRatio)
        gl.setSize(previousSize.x, previousSize.y, false)
        view.aspect = previousAspect
        if (previousView) view.setViewOffset(previousView.fullWidth, previousView.fullHeight, previousView.offsetX, previousView.offsetY, previousView.width, previousView.height)
        view.updateProjectionMatrix()
        invalidate()
      }
    }
    return () => {
      captureRef.current = null
    }
  }, [gl, scene, camera, invalidate, captureRef])
  return null
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 6]} intensity={0.8} />
      <directionalLight position={[-6, 3, -4]} intensity={0.4} />

      {/* Ambiente procedural (sem HDR externo): os metais do GLB precisam de reflexos */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[6, 1, 4]} rotation-y={-Math.PI / 3} scale={[6, 8, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 1, 4]} rotation-y={Math.PI / 3} scale={[6, 8, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 1, -7]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
    </>
  )
}

export default function CanViewer({
  config,
  pattern,
  customArtwork,
  stickers,
  artwork,
  texts,
  condensation,
  sugar,
  sealCustom,
  elements,
  onSelect,
  onPartSelect,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onResetAll,
  backdrop,
  backdropColors,
  exportOptions,
  exportApiRef,
}: {
  config: CanConfig
  pattern: PatternConfig
  customArtwork: CustomArtwork | null
  stickers: readonly Sticker[]
  artwork: ArtworkConfig
  texts: TextsConfig
  condensation: CondensationConfig
  sugar: SugarConfig
  sealCustom: SealCustomizationConfig
  /** elementos editáveis sobre a lata (bounds reais) e a seleção; a edição devolve patches aos estados do App */
  elements: readonly InteractiveElement[]
  onSelect: (id: string | null) => void
  /** toque numa parte da lata (lacre, corpo, tampa, fundo) que não é um elemento editável */
  onPartSelect: (part: CanPart) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onResetAll: () => void
  /** fundo do palco (ao vivo e na exportação) */
  backdrop: BackdropId
  backdropColors: BackdropColors
  /** o que o botão "Baixar imagem" da barra exporta (o painel Exportar usa a mesma função, via exportApiRef) */
  exportOptions: ExportOptions
  exportApiRef: RefObject<((options: ExportOptions) => Promise<void>) | null>
}) {
  const overlayRef = useRef<OverlayHandle>(null)
  const viewRef = useRef<ViewApi>(null)
  const partTagRef = useRef<PartTagHandle>(null)
  const captureRef = useRef<CaptureCan>(null)
  const runExport = async (options: ExportOptions) => {
    const capture = captureRef.current
    if (capture) await exportImage(capture, options, backdrop, backdropColors)
  }
  useEffect(() => {
    exportApiRef.current = runExport
    return () => {
      exportApiRef.current = null
    }
  })
  const [webgl] = useState(detectWebGL)
  const [zoomState, setZoomState] = useState<ZoomState>({ atMin: false, atMax: false })
  // ?quality=0|1|2 força um nível (teste); sem isso, o AdaptiveQuality decide
  const forced = new URLSearchParams(location.search).get('quality')
  // celular: começa em 1x (um aparelho de toque tem tela densa e GPU menor; o nível 0, com até 1,5x, é só para desktop)
  const [adaptive, setAdaptive] = useState<QualityLevel>(() => (isCoarsePointer() ? 1 : 0))
  const quality = (forced === '0' || forced === '1' || forced === '2' ? Number(forced) : adaptive) as QualityLevel

  return (
    <div className="relative h-full w-full">
      {/* cursor grab/grabbing só na área do 3D (os controles ficam fora deste contêiner) */}
      <StageBackdrop backdrop={backdrop} floorColor={backdropColors.floor} glowColor={backdropColors.glow} image={backdropColors.image} />
      {!webgl && <NoWebGL />}
      <div data-can-stage data-quality={quality} className="animate-stage-rise absolute inset-0">
        {webgl && <Canvas
          camera={{ position: [...INITIAL_CAMERA_POSITION], fov: CAMERA_FOV, near: 0.1, far: 100 }}
          frameloop="demand"
          dpr={quality === 0 ? [1, 1.5] : 1}
          gl={{ powerPreference: 'high-performance' }}
          onCreated={({ gl, invalidate }) => {
            // No celular o navegador pode descartar o contexto WebGL com a aba em segundo plano; sem isto a lata ficava em branco ao voltar
            const canvas = gl.domElement
            canvas.addEventListener('webglcontextlost', (event) => event.preventDefault())
            canvas.addEventListener('webglcontextrestored', () => invalidate())
          }}
        >
          <DrawOnChange />
          <CaptureBridge captureRef={captureRef} />
          {forced === null && <AdaptiveQuality level={quality} onChange={setAdaptive} />}
          <Lighting />
          <Suspense fallback={null}>
            <Can
              config={config}
              pattern={pattern}
              customArtwork={customArtwork}
              stickers={stickers}
              artwork={artwork}
              texts={texts}
              condensation={condensation}
              sugar={sugar}
              sealCustom={sealCustom}
              quality={quality}
            />
          </Suspense>
          <CameraRig
            apiRef={viewRef}
            onZoomState={(next) =>
              setZoomState((prev) => (prev.atMin === next.atMin && prev.atMax === next.atMax ? prev : next))
            }
          />
          {/* depois do CameraRig: o overlay é calculado com a câmera já atualizada neste quadro */}
          <ElementInteraction
            elements={elements}
            onSelect={onSelect}
            onPart={onPartSelect}
            partTagRef={partTagRef}
            overlayRef={overlayRef}
          />
        </Canvas>}
        <PartTag ref={partTagRef} />
      </div>

      {/* contorno, alças e rotação: camada independente da CanvasTexture (nunca vai para a exportação) */}
      <SelectionOverlay ref={overlayRef} />

      <CoachMarks />

      <ViewerControls
        onZoomIn={() => viewRef.current?.zoomIn()}
        onZoomOut={() => viewRef.current?.zoomOut()}
        onReset={() => viewRef.current?.reset()}
        atMinZoom={zoomState.atMin}
        atMaxZoom={zoomState.atMax}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onDownload={() => void runExport(exportOptions)}
        onResetAll={onResetAll}
      />
    </div>
  )
}

useGLTF.preload(MODEL_URL)
