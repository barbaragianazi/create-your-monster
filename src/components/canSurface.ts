import { Vector3, type BufferGeometry } from 'three'

/*
 * Ponto da superfície do corpo a partir do UV do GLB (o inverso do raycast, que dá o UV a partir da tela). Só leitura: usa a
 * geometria como está. Serve ao overlay de seleção, que precisa desenhar sobre a lata (curva, com 32 facetas) o contorno de um
 * retângulo definido no canvas de composição.
 *
 * Os triângulos são indexados numa grade sobre o espaço UV; a busca acha o triângulo que contém (u, v) e interpola posição e
 * normal por coordenadas baricêntricas (o mesmo que o pipeline de render faz com a textura).
 */

export type SurfacePoint = { position: Vector3; normal: Vector3 }

export type SurfaceLookup = {
  /** posição e normal, no espaço LOCAL do mesh, do ponto com esse UV; null fora da malha */
  locate: (u: number, v: number) => SurfacePoint | null
}

const CELLS = 96
const V_MIN = -0.1
const V_MAX = 1.1

export function createSurfaceLookup(geometry: BufferGeometry): SurfaceLookup {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  const index = geometry.index
  const triangleCount = (index ? index.count : position.count) / 3

  const cellU = (u: number) => Math.min(CELLS - 1, Math.max(0, Math.floor(u * CELLS)))
  const cellV = (v: number) => Math.min(CELLS - 1, Math.max(0, Math.floor(((v - V_MIN) / (V_MAX - V_MIN)) * CELLS)))

  const buckets: number[][] = Array.from({ length: CELLS * CELLS }, () => [])
  const vertex = (triangle: number, corner: number) => (index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner)

  for (let t = 0; t < triangleCount; t++) {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (let k = 0; k < 3; k++) {
      const i = vertex(t, k)
      minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i))
      minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i))
    }
    for (let cu = cellU(minU); cu <= cellU(maxU); cu++) {
      for (let cv = cellV(minV); cv <= cellV(maxV); cv++) buckets[cv * CELLS + cu].push(t)
    }
  }

  const EPS = 1e-6
  return {
    locate(u, v) {
      for (const t of buckets[cellV(v) * CELLS + cellU(u)]) {
        const a = vertex(t, 0), b = vertex(t, 1), c = vertex(t, 2)
        const ax = uv.getX(a), ay = uv.getY(a)
        const v0x = uv.getX(b) - ax, v0y = uv.getY(b) - ay
        const v1x = uv.getX(c) - ax, v1y = uv.getY(c) - ay
        const det = v0x * v1y - v1x * v0y
        if (Math.abs(det) < 1e-14) continue
        const px = u - ax, py = v - ay
        const wb = (px * v1y - v1x * py) / det
        const wc = (v0x * py - px * v0y) / det
        const wa = 1 - wb - wc
        if (wa < -EPS || wb < -EPS || wc < -EPS) continue

        const mix = (attribute: typeof position) =>
          new Vector3(
            attribute.getX(a) * wa + attribute.getX(b) * wb + attribute.getX(c) * wc,
            attribute.getY(a) * wa + attribute.getY(b) * wb + attribute.getY(c) * wc,
            attribute.getZ(a) * wa + attribute.getZ(b) * wb + attribute.getZ(c) * wc,
          )
        return { position: mix(position), normal: normal ? mix(normal).normalize() : new Vector3(0, 0, 1) }
      }
      return null
    },
  }
}
