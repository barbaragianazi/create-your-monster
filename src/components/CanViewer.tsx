import { Canvas } from '@react-three/fiber'
import { Center, Environment, Lightformer, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
import ViewerControls from './ViewerControls'
import ElementInteraction, { type InteractionApi } from './ElementInteraction'
import SelectionOverlay, { type OverlayHandle } from './SelectionOverlay'
import type { ElementPatch, InteractiveElement } from './canInteraction'
import { CAMERA_FOV, INITIAL_CAMERA_POSITION } from './viewerConfig'
import { findPartMesh, prepareCanScene } from './canModel'
import { IDENTITY_UV_LAYOUT } from './canUvLayout'
import { applyBodyFinish } from './canShoulderFinish'
import { resolveShoulderColor, resolveShoulderFinish } from './canShoulder'
import { useArtworkTexture } from './useArtworkTexture'
import { useShoulderFinishTarget } from './useShoulderFinishTarget'
import { CAN_FINISHES, CAN_PARTS, type CanConfig, type CanPart } from './canMaterials'

const MODEL_URL = '/models/monster-can.glb'

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
      <SealCustomization scene={scene} sealColor={config.seal.color} customization={sealCustom} />
      <Condensation scene={scene} config={condensation} coveredOpening={sealCustom.style === 'custom'} />
    </>
  )
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
  selectedId,
  onSelect,
  onElementChange,
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
  selectedId: string | null
  onSelect: (id: string | null) => void
  onElementChange: (id: string, patch: ElementPatch) => void
}) {
  const overlayRef = useRef<OverlayHandle>(null)
  const interactionRef = useRef<InteractionApi>(null)
  const viewRef = useRef<ViewApi>(null)
  const [zoomState, setZoomState] = useState<ZoomState>({ atMin: false, atMax: false })

  return (
    <div className="relative h-dvh w-full bg-neutral-200">
      {/* cursor grab/grabbing só na área do 3D (os controles ficam fora deste contêiner) */}
      <div data-can-stage className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <Canvas
          camera={{ position: [...INITIAL_CAMERA_POSITION], fov: CAMERA_FOV, near: 0.1, far: 100 }}
          dpr={[1, 2]}        >
          <color attach="background" args={['#e5e5e5']} />
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
            selectedId={selectedId}
            onSelect={onSelect}
            onChange={onElementChange}
            overlayRef={overlayRef}
            apiRef={interactionRef}
          />
        </Canvas>
      </div>

      {/* contorno, alças e rotação: camada independente da CanvasTexture (nunca vai para a exportação) */}
      <SelectionOverlay
        ref={overlayRef}
        onHandleDown={(kind, event) => interactionRef.current?.beginHandle(kind, event)}
      />

      <ViewerControls
        onZoomIn={() => viewRef.current?.zoomIn()}
        onZoomOut={() => viewRef.current?.zoomOut()}
        onReset={() => viewRef.current?.reset()}
        atMinZoom={zoomState.atMin}
        atMaxZoom={zoomState.atMax}
      />
    </div>
  )
}

useGLTF.preload(MODEL_URL)
