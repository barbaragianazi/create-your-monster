import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3, type Object3D } from 'three'
import type { CondensationConfig } from './canCondensation'
import { findPartMesh } from './canModel'
import { createCondensationLayer } from './condensationRender'
import { getCondensationLayout, getCoveredOpening } from './condensationSetup'

// Não renderiza nada no JSX: as gotas (2 InstancedMesh) são presas ao nó "lata" do GLB, o mesmo espaço dos meshes do corpo,
// então acompanham a lata em qualquer rotação/zoom. Cada controle mexe no mínimo possível:
// - layout (posições): gerado uma vez por lata (cache por cena), determinístico, nunca depende dos sliders;
// - Quantidade: só muda mesh.count; Tamanho: reescreve as matrizes; Intensidade: só um uniform.
/** Câmera parada por este tempo (ms): as microgotas voltam */
const SETTLE_MS = 160

export default function Condensation({
  scene,
  config,
  coveredOpening = false,
  amountScale = 1,
}: {
  scene: Object3D
  config: CondensationConfig
  /** lacre personalizado ativo: esconde as gotas que ficariam sob a superfície que fecha o furo do dedo */
  coveredOpening?: boolean
  /** multiplica a Quantidade (modo de qualidade reduzida: menos gotas para a GPU) */
  amountScale?: number
}) {
  const layer = useMemo(() => createCondensationLayer(), [])
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const host = useMemo(() => findPartMesh(scene, 'body')?.parent ?? undefined, [scene])

  useEffect(() => {
    if (host) return layer.attachTo(host)
  }, [layer, host])

  useEffect(() => () => layer.dispose(), [layer])

  // Os effects abaixo rodam depois do primeiro paint; o primeiro deles gera o layout, os demais pegam do cache
  useEffect(() => {
    const layout = getCondensationLayout(scene)
    if (layout) layer.setLayout(layout)
  }, [layer, scene])

  useEffect(() => {
    const layout = getCondensationLayout(scene)
    if (layout) layer.setSize(layout, config.size)
  }, [layer, scene, config.size])

  useEffect(() => {
    const layout = getCondensationLayout(scene)
    if (layout) layer.setCoveredRegion(layout, coveredOpening ? getCoveredOpening(scene) : null)
  }, [layer, scene, coveredOpening])

  useEffect(() => {
    const layout = getCondensationLayout(scene)
    if (layout) layer.setAmount(layout, config.amount * amountScale, config.enabled)
  }, [layer, scene, config.amount, config.enabled, amountScale])

  useEffect(() => {
    layer.setIntensity(config.intensity)
  }, [layer, config.intensity])

  // Câmera em movimento (girar, zoom, reset): sem as microgotas, que são a maior parte do custo e não se distinguem em movimento.
  // Elas voltam quando a câmera para. O Canvas desenha sob demanda, então um timer garante o quadro final com elas.
  const motion = useRef({ position: new Vector3(), quaternion: new Quaternion(), movedAt: 0, simplified: false, timer: 0 })
  useFrame(() => {
    const state = motion.current
    const moved = !state.position.equals(camera.position) || !state.quaternion.equals(camera.quaternion)
    const now = performance.now()
    if (moved) {
      state.position.copy(camera.position)
      state.quaternion.copy(camera.quaternion)
      state.movedAt = now
      window.clearTimeout(state.timer)
      state.timer = window.setTimeout(invalidate, SETTLE_MS + 20)
      if (!state.simplified) {
        state.simplified = true
        layer.setSimplified(true)
      }
    } else if (state.simplified && now - state.movedAt >= SETTLE_MS) {
      state.simplified = false
      layer.setSimplified(false)
    }
  })
  useEffect(() => () => window.clearTimeout(motion.current.timer), [])

  return null
}
