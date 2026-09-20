import type { BufferGeometry } from 'three'
import { findInteriorPoint, isSimplePolygon, signedArea, type Vec2 } from './sealPolygon'

/*
 * Detecção do furo do dedo no mesh do lacre, sem depender de índices fixos do GLB.
 *
 * O lacre é uma malha fechada com DOIS furos passantes: a abertura do dedo (oval grande) e a fenda do rebite (crescente,
 * menor), mais a cúpula do rebite (uma ilha com geometria dentro do contorno). Estratégia:
 *   1. solda os vértices por posição e pega as faces voltadas para cima (normal.y > TOP_FACING_NY);
 *   2. a maior região conexa dessas faces é a face superior do lacre; os laços da fronteira dela são o contorno
 *      externo + um laço por furo/ilha;
 *   3. só interessam os laços VAZADOS: num ponto realmente interior do laço não existe nenhum triângulo do lacre
 *      (isso descarta a cúpula do rebite);
 *   4. entre os vazados, o dedo é o de MAIOR área; se o segundo colocado for parecido demais (ambiguidade), ou se as
 *      proporções não baterem com o esperado, não devolve nada (melhor não preencher do que preencher a região errada).
 */

export type OpeningPoint = readonly [number, number, number]

export type FingerOpening = {
  /** vértices do laço, no espaço local da geometria do lacre (mesmos vértices da malha, na altura de cada um) */
  points: OpeningPoint[]
  /** plano ajustado por mínimos quadrados: y = a·x + b·z + c */
  plane: { a: number; b: number; c: number }
  /** área (xz) do furo e do contorno externo do lacre */
  area: number
  outerArea: number
  /** área do segundo maior furo vazado (a fenda do rebite), para diagnóstico */
  runnerUpArea: number | null
}

export type FingerOpeningResult = { opening: FingerOpening } | { reason: string }

const WELD_SCALE = 1e5
const TOP_FACING_NY = 0.3
const MIN_TOP_TRIANGLES = 50
const MIN_LOOP_VERTICES = 6
const OUTER_AREA_RATIO = { min: 0.08, max: 0.4 } // o furo do dedo ocupa ~19% do contorno do lacre
const AMBIGUITY_RATIO = 1.3 // o maior furo vazado precisa ser ≥ 1,3× o segundo (dedo ≈ 2× a fenda do rebite)
const BARYCENTRIC_EPSILON = 1e-9

type Loop = { ids: number[]; polygon: Vec2[]; area: number }

export function detectFingerOpening(geometry: BufferGeometry): FingerOpeningResult {
  const position = geometry.getAttribute('position')
  if (!position) return { reason: 'geometria sem atributo position' }
  const index = geometry.index

  // 1) solda de vértices (a malha do GLB pode duplicar vértices por normal/cor)
  const weldedByKey = new Map<string, number>()
  const points: [number, number, number][] = []
  const weld = new Int32Array(position.count)
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const key = `${Math.round(x * WELD_SCALE)},${Math.round(y * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`
    let id = weldedByKey.get(key)
    if (id === undefined) {
      id = points.length
      weldedByKey.set(key, id)
      points.push([x, y, z])
    }
    weld[i] = id
  }

  const triangles: [number, number, number][] = []
  const corners = index ? index.count : position.count
  for (let i = 0; i + 2 < corners; i += 3) {
    const a = weld[index ? index.getX(i) : i]
    const b = weld[index ? index.getX(i + 1) : i + 1]
    const c = weld[index ? index.getX(i + 2) : i + 2]
    if (a !== b && b !== c && a !== c) triangles.push([a, b, c])
  }
  if (triangles.length === 0) return { reason: 'geometria sem triângulos' }

  const edgeKey = (a: number, b: number) => (a < b ? a * points.length + b : b * points.length + a)

  // normal.y de cada triângulo (pelo sentido dos vértices, como o renderizador o vê)
  const facesUp = triangles.map(([a, b, c]) => {
    const p = points[a]
    const q = points[b]
    const r = points[c]
    const ux = q[0] - p[0]
    const uy = q[1] - p[1]
    const uz = q[2] - p[2]
    const vx = r[0] - p[0]
    const vy = r[1] - p[1]
    const vz = r[2] - p[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    return ny / (Math.hypot(nx, ny, nz) || 1) > TOP_FACING_NY
  })

  // 2) maior região conexa de faces voltadas para cima
  const trianglesOfEdge = new Map<number, number[]>()
  triangles.forEach(([a, b, c], t) => {
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      const list = trianglesOfEdge.get(key)
      if (list) list.push(t)
      else trianglesOfEdge.set(key, [t])
    }
  })

  const region = new Int32Array(triangles.length).fill(-1)
  let bestRegion: number[] = []
  let regionCount = 0
  for (let start = 0; start < triangles.length; start++) {
    if (!facesUp[start] || region[start] >= 0) continue
    const members: number[] = []
    const stack = [start]
    region[start] = regionCount
    while (stack.length > 0) {
      const t = stack.pop() as number
      members.push(t)
      const [a, b, c] = triangles[t]
      for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
        for (const other of trianglesOfEdge.get(key) ?? []) {
          if (facesUp[other] && region[other] < 0) {
            region[other] = regionCount
            stack.push(other)
          }
        }
      }
    }
    if (members.length > bestRegion.length) bestRegion = members
    regionCount++
  }
  if (bestRegion.length < MIN_TOP_TRIANGLES) return { reason: `face superior pequena demais (${bestRegion.length} triângulos)` }

  // 3) laços da fronteira da região
  const edgeCount = new Map<number, [number, number, number]>()
  for (const t of bestRegion) {
    const [a, b, c] = triangles[t]
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(u, v)
      const entry = edgeCount.get(key)
      if (entry) entry[2]++
      else edgeCount.set(key, [u, v, 1])
    }
  }
  const neighbours = new Map<number, number[]>()
  for (const [u, v, count] of edgeCount.values()) {
    if (count !== 1) continue
    neighbours.set(u, [...(neighbours.get(u) ?? []), v])
    neighbours.set(v, [...(neighbours.get(v) ?? []), u])
  }

  const loops: Loop[] = []
  const visited = new Set<number>()
  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue
    const ids = [start]
    visited.add(start)
    let previous = -1
    let current = start
    let valid = true
    for (;;) {
      const around = neighbours.get(current) ?? []
      if (around.length !== 2) {
        valid = false // vértice de junção: laço ambíguo, descarta
        break
      }
      const next = around.find((n) => n !== previous && !visited.has(n))
      if (next === undefined) break
      ids.push(next)
      visited.add(next)
      previous = current
      current = next
    }
    if (!valid || ids.length < MIN_LOOP_VERTICES) continue
    const polygon: Vec2[] = ids.map((id) => [points[id][0], points[id][2]])
    loops.push({ ids, polygon, area: Math.abs(signedArea(polygon)) })
  }
  if (loops.length < 2) return { reason: `laços de fronteira insuficientes (${loops.length})` }

  loops.sort((a, b) => b.area - a.area)
  const outer = loops[0]

  // 4) só os furos VAZADOS: num ponto interior do laço não pode haver nenhum triângulo do lacre
  const geometryAt = (x: number, z: number) => {
    for (const [a, b, c] of triangles) {
      const p = points[a]
      const q = points[b]
      const r = points[c]
      const det = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2])
      if (Math.abs(det) < 1e-12) continue
      const l1 = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / det
      const l2 = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / det
      const l3 = 1 - l1 - l2
      if (l1 >= -BARYCENTRIC_EPSILON && l2 >= -BARYCENTRIC_EPSILON && l3 >= -BARYCENTRIC_EPSILON) return true
    }
    return false
  }

  const throughHoles = loops.slice(1).filter((loop) => {
    if (!isSimplePolygon(loop.polygon)) return false
    const inside = findInteriorPoint(loop.polygon)
    return inside !== null && !geometryAt(inside[0], inside[1])
  })
  if (throughHoles.length === 0) return { reason: 'nenhum furo vazado encontrado na face superior' }

  const [finger, runnerUp] = throughHoles
  if (finger.area / outer.area < OUTER_AREA_RATIO.min || finger.area / outer.area > OUTER_AREA_RATIO.max) {
    return { reason: `proporção furo/contorno fora do esperado (${(finger.area / outer.area).toFixed(3)})` }
  }
  if (runnerUp && finger.area < runnerUp.area * AMBIGUITY_RATIO) {
    return { reason: 'dois furos de tamanho parecido: não dá para distinguir o do dedo do rebite' }
  }

  const loopPoints = finger.ids.map((id) => [points[id][0], points[id][1], points[id][2]] as const)
  return {
    opening: {
      points: [...loopPoints],
      plane: fitPlane(loopPoints),
      area: finger.area,
      outerArea: outer.area,
      runnerUpArea: runnerUp?.area ?? null,
    },
  }
}

// y = a·x + b·z + c por mínimos quadrados (regra de Cramer nas equações normais)
function fitPlane(points: readonly OpeningPoint[]) {
  let sx = 0
  let sz = 0
  let sy = 0
  let sxx = 0
  let szz = 0
  let sxz = 0
  let sxy = 0
  let szy = 0
  for (const [x, y, z] of points) {
    sx += x
    sz += z
    sy += y
    sxx += x * x
    szz += z * z
    sxz += x * z
    sxy += x * y
    szy += z * y
  }
  const n = points.length
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const matrix = [
    [sxx, sxz, sx],
    [sxz, szz, sz],
    [sx, sz, n],
  ]
  const rhs = [sxy, szy, sy]
  const det = det3(matrix)
  const replaced = (column: number) => matrix.map((row, i) => row.map((value, j) => (j === column ? rhs[i] : value)))
  if (Math.abs(det) < 1e-12) return { a: 0, b: 0, c: sy / n }
  return { a: det3(replaced(0)) / det, b: det3(replaced(1)) / det, c: det3(replaced(2)) / det }
}
