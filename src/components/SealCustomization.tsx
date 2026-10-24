import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Object3D } from 'three'
import { findPartMesh } from './canModel'
import { createSealCustomLayer, getSealParts } from './sealCap'
import { loadLogoMask } from './sealLogo'
import { resolveLogoColor, type SealCustomization as SealCustomizationConfig } from './sealStyle'

// Não renderiza nada no JSX: tampa do furo do dedo + decalque do M são criados UMA vez e presos ao objeto `lacre`, herdando
// posição/rotação/escala dele. Padrão ↔ Personalizado só alterna `visible` (nada é recriado, recarregado ou duplicado).
// Se a geometria esperada não for encontrada, `layer` é null: não faz nada e o lacre padrão segue normal.
export default function SealCustomization({
  scene,
  sealColor,
  customization,
}: {
  scene: Object3D
  sealColor: string
  customization: SealCustomizationConfig
}) {
  const invalidate = useThree((state) => state.invalidate)
  const layer = useMemo(() => {
    const seal = findPartMesh(scene, 'seal')
    const parts = seal ? getSealParts(scene) : null
    return seal && parts ? createSealCustomLayer(seal, parts) : null
  }, [scene])

  useEffect(() => layer?.attach(), [layer])

  // a máscara do M é assíncrona (SVG → canvas); o decalque só aparece quando ela existe
  useEffect(() => {
    if (!layer) return
    let cancelled = false
    loadLogoMask().then((mask) => {
      if (cancelled) return
      layer.setLogoMask(mask)
      invalidate()
    })
    return () => {
      cancelled = true
      layer.dispose()
    }
  }, [layer, invalidate])

  useEffect(() => {
    layer?.setVisible(customization.style === 'custom', customization.logo.enabled)
  }, [layer, customization.style, customization.logo.enabled])

  // cor automática (contraste com o lacre) ou a última cor manual
  const logoColor = resolveLogoColor(sealColor, customization.logo)
  useEffect(() => {
    layer?.setLogoColor(logoColor)
  }, [layer, logoColor])

  return null
}
