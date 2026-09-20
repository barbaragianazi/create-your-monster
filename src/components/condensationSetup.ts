import { Matrix4, Vector3, type Mesh, type Object3D } from 'three'
import { findPartMesh } from './canModel'
import { generateLayout, type CondensationLayout } from './condensationLayout'
import { createFootprint, createLidSampler, createSideSampler, type SurfaceSource } from './condensationSurface'
import { getSealParts } from './sealCap'
import type { Vec2 } from './sealPolygon'

const TAB_MARGIN = 0.045 // folga ao redor do lacre, em unidades do modelo
const TAB_GRID = 200

// O scene do useGLTF é cacheado (e o layout é determinístico), então um layout por cena basta
const cache = new WeakMap<Object3D, CondensationLayout>()

/**
 * Monta as superfícies a partir dos meshes do GLB e gera o layout das gotas.
 * - laterais: corpo + tampa/fundo (ombro, pescoço, rebordo e chanfro do fundo estão nesses meshes);
 * - tampa: só o mesh superior, vista de cima;
 * - lacre: mesh independente, usado apenas como zona proibida (projeção no plano da tampa).
 * Tudo em coordenadas do nó "lata" (o pai dos meshes), onde as instâncias também são anexadas.
 */
export function getCondensationLayout(scene: Object3D) {
  const cached = cache.get(scene)
  if (cached) return cached

  const body = findPartMesh(scene, 'body')
  const top = findPartMesh(scene, 'top')
  const bottom = findPartMesh(scene, 'bottom')
  const seal = findPartMesh(scene, 'seal')
  const host = body?.parent
  if (!body || !top || !bottom || !host) return undefined

  const local = (mesh: Mesh): SurfaceSource => {
    mesh.updateMatrix()
    return { geometry: mesh.geometry, matrix: mesh.matrix }
  }

  const side = createSideSampler([local(body), local(top), local(bottom)])
  const lid = createLidSampler([local(top)])

  let tab = null
  if (seal) {
    // lacre → espaço do nó "lata": os ancestrais em comum se cancelam, então isso vale antes mesmo do primeiro render
    host.updateWorldMatrix(true, false)
    seal.updateWorldMatrix(true, false)
    const sealToHost = new Matrix4().copy(host.matrixWorld).invert().multiply(seal.matrixWorld)
    tab = createFootprint([{ geometry: seal.geometry, matrix: sealToHost }], 1, TAB_GRID, TAB_MARGIN)
  }

  const layout = generateLayout(side, lid, tab)
  cache.set(scene, layout)
  return layout
}

// Polígono (xz, espaço do nó "lata") do furo do dedo, para esconder as gotas que ficam sob a superfície do lacre personalizado.
// Só otimização: o layout aprovado não é regenerado nem alterado.
const openingCache = new WeakMap<Object3D, readonly Vec2[] | null>()

export function getCoveredOpening(scene: Object3D) {
  if (openingCache.has(scene)) return openingCache.get(scene) ?? null

  const parts = getSealParts(scene)
  const seal = findPartMesh(scene, 'seal')
  const host = findPartMesh(scene, 'body')?.parent
  let polygon: Vec2[] | null = null
  if (parts && seal && host) {
    host.updateWorldMatrix(true, false)
    seal.updateWorldMatrix(true, false)
    const sealToHost = new Matrix4().copy(host.matrixWorld).invert().multiply(seal.matrixWorld)
    const point = new Vector3()
    polygon = parts.opening.points.map(([x, y, z]) => {
      point.set(x, y, z).applyMatrix4(sealToHost)
      return [point.x, point.z] as const
    })
  }
  openingCache.set(scene, polygon)
  return polygon
}
