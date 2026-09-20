import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  ShapeUtils,
  Vector2,
  type Material,
  type Object3D,
} from 'three'
import { findPartMesh } from './canModel'
import { LOGO_ASPECT } from './sealLogo'
import { detectFingerOpening, type FingerOpening } from './sealOpening'
import { pointInPolygon, rectangleInside, signedArea, type Vec2 } from './sealPolygon'

/*
 * Superfície que fecha SÓ o furo do dedo do lacre + decalque do Monster M sobre ela.
 * Tudo é gerado em runtime a partir da malha real (o GLB não é alterado) e vive como FILHO do objeto `lacre`, no espaço
 * local da própria geometria dele: posição, rotação e escala do lacre são herdadas pelo grafo de cena, sem copiar matrizes.
 */

// Calibração interna (não exposta ao usuário)
/**
 * rotação do M em torno da normal, em graus. 0 = topo do M (pernas grossas) para o rebite (+z do lacre);
 * 180 = topo do M para a ponta livre do lacre (onde o dedo entra), pontas finas para o rebite. Vale para qualquer valor: não espelha.
 */
export const LOGO_UP_DEGREES = 180
/** fração do maior M inscrito no furo (o resto é margem até a borda) */
export const LOGO_FILL = 0.8
/** elevação do decalque sobre a tampa, ao longo da normal (o polygonOffset cobre o resto) */
export const LOGO_LIFT = 0.0006
const LOGO_GRID = { x: 8, y: 12 } // o decalque é uma grade que acompanha a superfície real da tampa
const FIT_SAMPLES = 40
const FIT_ITERATIONS = 22
const AREA_TOLERANCE = 0.01 // a soma das áreas dos triângulos da tampa tem que bater com a do polígono

export type SealParts = {
  opening: FingerOpening
  cap: { positions: Float32Array; normals: Float32Array; indices: Uint16Array }
  logo: {
    positions: Float32Array
    normals: Float32Array
    uvs: Float32Array
    indices: Uint16Array
    /** altura/largura finais do M e centro (xz), em unidades do modelo */
    height: number
    width: number
    center: Vec2
  }
}

export type SealPartsResult = { parts: SealParts } | { reason: string }

type Tri3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]

export function buildSealParts(geometry: BufferGeometry): SealPartsResult {
  const detected = detectFingerOpening(geometry)
  if ('reason' in detected) return { reason: detected.reason }
  const { opening } = detected
  const { points, plane } = opening

  // Normal do plano ajustado (a tampa e o decalque são iluminados como uma superfície plana, sem vincos de triangulação)
  const normalLength = Math.hypot(plane.a, 1, plane.b)
  const normal: [number, number, number] = [-plane.a / normalLength, 1 / normalLength, -plane.b / normalLength]

  // --- Tampa: plano ajustado ao aro, rebaixado o mínimo para nunca ficar ACIMA dele ---
  // Triangular direto os vértices do aro (heights exatas) cria fatias finíssimas e íngremes entre vértices quase colineares;
  // de costas (o material é de face dupla) elas apareciam como uma linha. Já o aro real tem um degrau e um "dente", então
  // nem uma faixa de transição bem comportada é possível. Uma tampa COPLANAR não tem nada disso. O plano é deslocado para
  // baixo pelo menor resíduo (assim nenhum ponto do contorno fica acima do aro); as paredes do furo inclinam para dentro,
  // então a borda da tampa fica enterrada no lacre, sem fresta.
  const polygon: Vec2[] = points.map(([x, , z]) => [x, z])
  const minResidual = Math.min(...points.map(([x, y, z]) => y - (plane.a * x + plane.b * z + plane.c)))
  const planeY = (x: number, z: number) => plane.a * x + plane.b * z + plane.c + Math.min(0, minResidual)

  const triangulated = ShapeUtils.triangulateShape(polygon.map(([x, z]) => new Vector2(x, z)), [])
  if (triangulated.length === 0) return { reason: 'triangulação da tampa vazia' }

  const vertices: (readonly [number, number, number])[] = polygon.map(([x, z]) => [x, planeY(x, z), z] as const)
  const capTriangles: Tri3[] = []
  const indices: number[] = []
  for (const [i, j, k] of triangulated) {
    let [a, b, c] = [i, j, k]
    const p = vertices[a]
    const q = vertices[b]
    const r = vertices[c]
    // sentido anti-horário visto de cima: normal.y > 0 (a face da frente do material é a de cima)
    const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2])
    if (ny < 0) [b, c] = [c, b]
    indices.push(a, b, c)
    capTriangles.push([vertices[a], vertices[b], vertices[c]])
  }

  const coveredArea = capTriangles.reduce(
    (sum, [p, q, r]) => sum + Math.abs((q[0] - p[0]) * (r[2] - p[2]) - (r[0] - p[0]) * (q[2] - p[2])) / 2,
    0,
  )
  if (Math.abs(coveredArea - Math.abs(signedArea(polygon))) > Math.abs(signedArea(polygon)) * AREA_TOLERANCE) {
    return { reason: 'a triangulação não cobre o polígono do furo' }
  }

  const positions = new Float32Array(vertices.flat())
  const normals = new Float32Array(vertices.length * 3)
  for (let i = 0; i < vertices.length; i++) normals.set(normal, i * 3)

  // --- Monster M de pé: maior retângulo (proporção do M) inscrito no furo, orientado por LOGO_UP_DEGREES ---
  const radians = (LOGO_UP_DEGREES * Math.PI) / 180
  const up: Vec2 = [Math.sin(radians), Math.cos(radians)]
  const right: Vec2 = [-up[1], up[0]] // visto de cima, a direita do M é sempre a direita de quem olha (não espelhado)

  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  const box = { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] }
  const maxHeight = Math.max(box.x[1] - box.x[0], box.z[1] - box.z[0])

  const fitAt = (center: Vec2) => {
    let low = 0
    let high = maxHeight
    for (let iteration = 0; iteration < FIT_ITERATIONS; iteration++) {
      const height = (low + high) / 2
      if (rectangleInside(polygon, center, right, up, height * LOGO_ASPECT, height)) low = height
      else high = height
    }
    return low
  }

  const candidates: { center: Vec2; height: number }[] = []
  for (let i = 0; i <= FIT_SAMPLES; i++) {
    for (let j = 0; j <= FIT_SAMPLES; j++) {
      const center: Vec2 = [
        box.x[0] + ((box.x[1] - box.x[0]) * i) / FIT_SAMPLES,
        box.z[0] + ((box.z[1] - box.z[0]) * j) / FIT_SAMPLES,
      ]
      if (pointInPolygon(center[0], center[1], polygon)) candidates.push({ center, height: fitAt(center) })
    }
  }
  const bestHeight = Math.max(0, ...candidates.map((c) => c.height))
  if (bestHeight <= 0) return { reason: 'o Monster M não cabe no furo' }

  // vários centros empatam quase no máximo: fica o mais próximo do centro do furo (M centralizado)
  const middle: Vec2 = [(box.x[0] + box.x[1]) / 2, (box.z[0] + box.z[1]) / 2]
  const chosen = candidates
    .filter((c) => c.height >= bestHeight * 0.97)
    .reduce((best, c) =>
      Math.hypot(c.center[0] - middle[0], c.center[1] - middle[1]) < Math.hypot(best.center[0] - middle[0], best.center[1] - middle[1])
        ? c
        : best,
    )
  const logoHeight = chosen.height * LOGO_FILL
  const logoWidth = logoHeight * LOGO_ASPECT

  // --- Decalque: grade que acompanha a superfície da tampa (levemente elevada), com UVs do M ---
  const columns = LOGO_GRID.x
  const rows = LOGO_GRID.y
  const logoPositions = new Float32Array((columns + 1) * (rows + 1) * 3)
  const logoNormals = new Float32Array(logoPositions.length)
  const logoUvs = new Float32Array((columns + 1) * (rows + 1) * 2)
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const u = (i / columns - 0.5) * logoWidth
      const v = (j / rows - 0.5) * logoHeight
      const x = chosen.center[0] + right[0] * u + up[0] * v
      const z = chosen.center[1] + right[1] * u + up[1] * v
      const y = planeY(x, z)
      const k = j * (columns + 1) + i
      logoPositions.set([x + normal[0] * LOGO_LIFT, y + normal[1] * LOGO_LIFT, z + normal[2] * LOGO_LIFT], k * 3)
      logoNormals.set(normal, k * 3)
      logoUvs.set([i / columns, j / rows], k * 2) // j = rows é o topo do M (v = 1)
    }
  }
  const logoIndices: number[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i
      const b = a + 1
      const c = a + columns + 1
      const d = c + 1
      for (const tri of [[a, b, d], [a, d, c]]) {
        let [p, q, r] = tri
        const P = logoPositions.subarray(p * 3, p * 3 + 3)
        const Q = logoPositions.subarray(q * 3, q * 3 + 3)
        const R = logoPositions.subarray(r * 3, r * 3 + 3)
        const ny = (Q[2] - P[2]) * (R[0] - P[0]) - (Q[0] - P[0]) * (R[2] - P[2])
        if (ny < 0) [q, r] = [r, q]
        logoIndices.push(p, q, r)
      }
    }
  }

  return {
    parts: {
      opening,
      cap: { positions, normals, indices: Uint16Array.from(indices) },
      logo: {
        positions: logoPositions,
        normals: logoNormals,
        uvs: logoUvs,
        indices: Uint16Array.from(logoIndices),
        height: logoHeight,
        width: logoWidth,
        center: chosen.center,
      },
    },
  }
}

// O scene do useGLTF é cacheado (e a geometria não muda): uma detecção por cena basta
const partsCache = new WeakMap<Object3D, SealParts | null>()

/** Partes da personalização do lacre, ou null se a geometria esperada não foi encontrada (aí só existe o lacre padrão) */
export function getSealParts(scene: Object3D) {
  if (partsCache.has(scene)) return partsCache.get(scene) ?? null

  const seal = findPartMesh(scene, 'seal')
  let parts: SealParts | null = null
  if (!seal) {
    warnOnce('lacre não encontrado no modelo')
  } else {
    const result = buildSealParts(seal.geometry)
    if ('parts' in result) parts = result.parts
    else warnOnce(`furo do dedo não identificado (${result.reason}); o lacre personalizado fica indisponível`)
  }
  partsCache.set(scene, parts)
  return parts
}

function warnOnce(message: string) {
  if (import.meta.env.DEV) console.warn(`[lacre] ${message}`)
}

// --- Camada Three ------------------------------------------------------------------------------------------------

export type SealCustomLayer = {
  /** Anexa tampa + decalque ao lacre; devolve a função que remove */
  attach: () => () => void
  setVisible: (custom: boolean, logo: boolean) => void
  setLogoColor: (hex: string) => void
  /** Máscara do M (branco = tinta); só depois dela o decalque pode aparecer */
  setLogoMask: (canvas: HTMLCanvasElement) => void
  dispose: () => void
}

export function createSealCustomLayer(seal: Mesh, parts: SealParts): SealCustomLayer {
  // Tampa: MESMO material do lacre (cor e acabamento acompanham sozinhos). O material tem vertexColors (o GLB traz
  // COLOR_0), então a geometria precisa do atributo `color`, senão sairia preta: branco = não altera nada.
  const capGeometry = new BufferGeometry()
  capGeometry.setAttribute('position', new BufferAttribute(parts.cap.positions, 3))
  capGeometry.setAttribute('normal', new BufferAttribute(parts.cap.normals, 3))
  capGeometry.setAttribute('color', new BufferAttribute(new Float32Array((parts.cap.positions.length / 3) * 4).fill(1), 4))
  capGeometry.setIndex(new BufferAttribute(parts.cap.indices, 1))
  const cap = new Mesh(capGeometry, seal.material as Material)
  cap.name = 'seal-cap'
  cap.userData.generated = true
  cap.visible = false

  // Decalque do M: mesh independente, transparente, sem escrever profundidade, com offset de polígono
  const logoGeometry = new BufferGeometry()
  logoGeometry.setAttribute('position', new BufferAttribute(parts.logo.positions, 3))
  logoGeometry.setAttribute('normal', new BufferAttribute(parts.logo.normals, 3))
  logoGeometry.setAttribute('uv', new BufferAttribute(parts.logo.uvs, 2))
  logoGeometry.setIndex(new BufferAttribute(parts.logo.indices, 1))
  const logoMaterial = new MeshStandardMaterial({
    color: '#000000',
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const logo = new Mesh(logoGeometry, logoMaterial)
  logo.name = 'seal-logo'
  logo.userData.generated = true
  logo.visible = false

  let maskTexture: CanvasTexture | null = null
  const state = { custom: false, logo: true, ready: false }
  const refresh = () => {
    cap.visible = state.custom
    logo.visible = state.custom && state.logo && state.ready
  }

  return {
    attach: () => {
      seal.add(cap, logo)
      return () => {
        seal.remove(cap, logo)
      }
    },
    setVisible: (custom, showLogo) => {
      state.custom = custom
      state.logo = showLogo
      refresh()
    },
    setLogoColor: (hex) => {
      logoMaterial.color.set(hex)
    },
    setLogoMask: (canvas) => {
      maskTexture?.dispose()
      maskTexture = new CanvasTexture(canvas)
      maskTexture.anisotropy = 8
      logoMaterial.alphaMap = maskTexture
      logoMaterial.needsUpdate = true
      state.ready = true
      refresh()
    },
    dispose: () => {
      // o material da tampa é do lacre: não é descartado aqui
      capGeometry.dispose()
      logoGeometry.dispose()
      logoMaterial.dispose()
      maskTexture?.dispose()
      maskTexture = null
      state.ready = false
    },
  }
}
