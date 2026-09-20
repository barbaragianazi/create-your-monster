import { useEffect, useMemo } from 'react'
import type { Object3D } from 'three'
import type { CondensationConfig } from './canCondensation'
import { findPartMesh } from './canModel'
import { createCondensationLayer } from './condensationRender'
import { getCondensationLayout, getCoveredOpening } from './condensationSetup'

// Não renderiza nada no JSX: as gotas (2 InstancedMesh) são presas ao nó "lata" do GLB, o mesmo espaço dos meshes do corpo,
// então acompanham a lata em qualquer rotação/zoom. Cada controle mexe no mínimo possível:
// - layout (posições): gerado uma vez por lata (cache por cena), determinístico, nunca depende dos sliders;
// - Quantidade: só muda mesh.count; Tamanho: reescreve as matrizes; Intensidade: só um uniform.
export default function Condensation({
  scene,
  config,
  coveredOpening = false,
}: {
  scene: Object3D
  config: CondensationConfig
  /** lacre personalizado ativo: esconde as gotas que ficariam sob a superfície que fecha o furo do dedo */
  coveredOpening?: boolean
}) {
  const layer = useMemo(() => createCondensationLayer(), [])
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
    if (layout) layer.setAmount(layout, config.amount, config.enabled)
  }, [layer, scene, config.amount, config.enabled])

  useEffect(() => {
    layer.setIntensity(config.intensity)
  }, [layer, config.intensity])

  return null
}
