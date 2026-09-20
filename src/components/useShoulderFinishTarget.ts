import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { createShoulderFinishTarget } from './canShoulderFinish'
import type { BodyUvLayout } from './canUvLayout'

/** Mapa de acabamento do ombro (ver canShoulderFinish): criado uma vez, só chega à GPU quando o material o usa */
export function useShoulderFinishTarget(uvLayout: BodyUvLayout) {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const [target] = useState(() => createShoulderFinishTarget(maxAnisotropy, uvLayout))

  useEffect(() => () => target.texture.dispose(), [target])

  return target
}
