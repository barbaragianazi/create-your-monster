import type { BufferGeometry, Matrix4 } from 'three'

// Amostragem da superfície REAL da lata: em vez de assumir um cilindro (ou um perfil liso), cada gota nasce de um raio
// lançado contra os triângulos do GLB. A posição e a normal já incluem ombro, pescoço, chanfro do fundo, as 32 facetas
// do corpo e o relevo da tampa. Tudo em coordenadas do grupo pai dos meshes (o nó "lata").

export type SurfaceSource = { geometry: BufferGeometry; matrix: Matrix4 }

export type SurfaceHit = { px: number; py: number; pz: number; nx: number; ny: number; nz: number }

type TriangleSoup = {
  count: number
  /** x, y, z por triângulo: vértice 0 e as arestas e1 = v1−v0, e2 = v2−v0 */
  v0: Float32Array
  e1: Float32Array
  e2: Float32Array
}

function buildSoup(sources: readonly SurfaceSource[]): TriangleSoup {
  let count = 0
  for (const { geometry } of sources) {
    count += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
  }

  const soup: TriangleSoup = {
    count,
    v0: new Float32Array(count * 3),
    e1: new Float32Array(count * 3),
    e2: new Float32Array(count * 3),
  }
  const p = [new Float32Array(3), new Float32Array(3), new Float32Array(3)]

  let t = 0
  for (const { geometry, matrix } of sources) {
    const position = geometry.getAttribute('position')
    const index = geometry.index
    const m = matrix.elements
    const triangles = (index ? index.count : position.count) / 3

    for (let i = 0; i < triangles; i++) {
      for (let k = 0; k < 3; k++) {
        const vertex = index ? index.getX(i * 3 + k) : i * 3 + k
        const x = position.getX(vertex)
        const y = position.getY(vertex)
        const z = position.getZ(vertex)
        p[k][0] = m[0] * x + m[4] * y + m[8] * z + m[12]
        p[k][1] = m[1] * x + m[5] * y + m[9] * z + m[13]
        p[k][2] = m[2] * x + m[6] * y + m[10] * z + m[14]
      }
      for (let c = 0; c < 3; c++) {
        soup.v0[t * 3 + c] = p[0][c]
        soup.e1[t * 3 + c] = p[1][c] - p[0][c]
        soup.e2[t * 3 + c] = p[2][c] - p[0][c]
      }
      t++
    }
  }
  return soup
}

const EPSILON = 1e-9

/** Möller–Trumbore, dupla face. Retorna a distância t (> 0) ou -1 */
function intersect(soup: TriangleSoup, tri: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
  const o = tri * 3
  const e1x = soup.e1[o]
  const e1y = soup.e1[o + 1]
  const e1z = soup.e1[o + 2]
  const e2x = soup.e2[o]
  const e2y = soup.e2[o + 1]
  const e2z = soup.e2[o + 2]

  const hx = dy * e2z - dz * e2y
  const hy = dz * e2x - dx * e2z
  const hz = dx * e2y - dy * e2x
  const det = e1x * hx + e1y * hy + e1z * hz
  if (det > -EPSILON && det < EPSILON) return -1

  const inv = 1 / det
  const sx = ox - soup.v0[o]
  const sy = oy - soup.v0[o + 1]
  const sz = oz - soup.v0[o + 2]
  const u = inv * (sx * hx + sy * hy + sz * hz)
  if (u < 0 || u > 1) return -1

  const qx = sy * e1z - sz * e1y
  const qy = sz * e1x - sx * e1z
  const qz = sx * e1y - sy * e1x
  const v = inv * (dx * qx + dy * qy + dz * qz)
  if (v < 0 || u + v > 1) return -1

  const t = inv * (e2x * qx + e2y * qy + e2z * qz)
  return t > EPSILON ? t : -1
}

/** Ponto e normal (unitária, voltada para a origem do raio) do triângulo atingido */
function writeHit(soup: TriangleSoup, tri: number, t: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: SurfaceHit) {
  const o = tri * 3
  const e1x = soup.e1[o]
  const e1y = soup.e1[o + 1]
  const e1z = soup.e1[o + 2]
  const e2x = soup.e2[o]
  const e2y = soup.e2[o + 1]
  const e2z = soup.e2[o + 2]

  let nx = e1y * e2z - e1z * e2y
  let ny = e1z * e2x - e1x * e2z
  let nz = e1x * e2y - e1y * e2x
  const length = Math.hypot(nx, ny, nz) || 1
  const facing = nx * dx + ny * dy + nz * dz > 0 ? -1 : 1
  nx = (nx / length) * facing
  ny = (ny / length) * facing
  nz = (nz / length) * facing

  out.px = ox + dx * t
  out.py = oy + dy * t
  out.pz = oz + dz * t
  out.nx = nx
  out.ny = ny
  out.nz = nz
}

// --- Laterais (corpo, ombro, pescoço, rebordo, chanfro do fundo) ------------------------------

export type SideSampler = {
  yMin: number
  yMax: number
  radiusMax: number
  /** Raio horizontal de fora para o eixo, na altura y e no ângulo theta; acerta sempre a superfície mais externa */
  sample: (theta: number, y: number, out: SurfaceHit) => boolean
}

const BIN_HEIGHT = 0.02

export function createSideSampler(sources: readonly SurfaceSource[]): SideSampler {
  const soup = buildSoup(sources)

  let yMin = Infinity
  let yMax = -Infinity
  let radiusMax = 0
  for (let t = 0; t < soup.count; t++) {
    for (let k = 0; k < 3; k++) {
      const x = soup.v0[t * 3] + (k === 1 ? soup.e1[t * 3] : k === 2 ? soup.e2[t * 3] : 0)
      const y = soup.v0[t * 3 + 1] + (k === 1 ? soup.e1[t * 3 + 1] : k === 2 ? soup.e2[t * 3 + 1] : 0)
      const z = soup.v0[t * 3 + 2] + (k === 1 ? soup.e1[t * 3 + 2] : k === 2 ? soup.e2[t * 3 + 2] : 0)
      yMin = Math.min(yMin, y)
      yMax = Math.max(yMax, y)
      radiusMax = Math.max(radiusMax, Math.hypot(x, z))
    }
  }

  // Cada faixa de altura guarda só os triângulos que a cruzam: ~100 testes por raio em vez de ~5000
  const bins = Math.ceil((yMax - yMin) / BIN_HEIGHT) + 1
  const binStart = new Int32Array(bins + 1)
  const range = (t: number) => {
    const y0 = soup.v0[t * 3 + 1]
    const y1 = y0 + soup.e1[t * 3 + 1]
    const y2 = y0 + soup.e2[t * 3 + 1]
    return [
      Math.max(0, Math.floor((Math.min(y0, y1, y2) - yMin) / BIN_HEIGHT)),
      Math.min(bins - 1, Math.floor((Math.max(y0, y1, y2) - yMin) / BIN_HEIGHT)),
    ] as const
  }
  for (let t = 0; t < soup.count; t++) {
    const [lo, hi] = range(t)
    for (let b = lo; b <= hi; b++) binStart[b + 1]++
  }
  for (let b = 0; b < bins; b++) binStart[b + 1] += binStart[b]
  const binTriangles = new Int32Array(binStart[bins])
  const fill = binStart.slice(0, bins)
  for (let t = 0; t < soup.count; t++) {
    const [lo, hi] = range(t)
    for (let b = lo; b <= hi; b++) binTriangles[fill[b]++] = t
  }

  const originRadius = radiusMax + 0.2

  return {
    yMin,
    yMax,
    radiusMax,
    sample: (theta, y, out) => {
      const bin = Math.floor((y - yMin) / BIN_HEIGHT)
      if (bin < 0 || bin >= bins) return false

      const dx = -Math.cos(theta)
      const dz = -Math.sin(theta)
      const ox = -dx * originRadius
      const oz = -dz * originRadius

      let best = Infinity
      let bestTriangle = -1
      for (let i = binStart[bin]; i < binStart[bin + 1]; i++) {
        const tri = binTriangles[i]
        const t = intersect(soup, tri, ox, y, oz, dx, 0, dz)
        if (t > 0 && t < best) {
          best = t
          bestTriangle = tri
        }
      }
      if (bestTriangle < 0) return false
      writeHit(soup, bestTriangle, best, ox, y, oz, dx, 0, dz, out)
      return true
    },
  }
}

// --- Tampa (painel superior) -------------------------------------------------------------------

export type LidSampler = {
  radius: number
  /** altura aproximada do painel (para a densidade de ruído, que é 3D) */
  y: number
  /** Raio vertical de cima para baixo em (x, z); só considera superfícies voltadas para cima */
  sample: (x: number, z: number, out: SurfaceHit) => boolean
}

const UP_FACING = 0.5

export function createLidSampler(sources: readonly SurfaceSource[]): LidSampler | null {
  const full = buildSoup(sources)

  // só triângulos voltados para cima: vistos de cima, a primeira superfície é sempre uma delas
  const keep: number[] = []
  for (let t = 0; t < full.count; t++) {
    const o = t * 3
    const ny = full.e1[o + 2] * full.e2[o] - full.e1[o] * full.e2[o + 2]
    const nx = full.e1[o + 1] * full.e2[o + 2] - full.e1[o + 2] * full.e2[o + 1]
    const nz = full.e1[o] * full.e2[o + 1] - full.e1[o + 1] * full.e2[o]
    if (Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) > UP_FACING) keep.push(t)
  }
  if (keep.length === 0) return null

  const soup: TriangleSoup = {
    count: keep.length,
    v0: new Float32Array(keep.length * 3),
    e1: new Float32Array(keep.length * 3),
    e2: new Float32Array(keep.length * 3),
  }
  let yTop = -Infinity
  let radius = 0
  keep.forEach((t, i) => {
    for (let c = 0; c < 3; c++) {
      soup.v0[i * 3 + c] = full.v0[t * 3 + c]
      soup.e1[i * 3 + c] = full.e1[t * 3 + c]
      soup.e2[i * 3 + c] = full.e2[t * 3 + c]
    }
    for (let k = 0; k < 3; k++) {
      const x = soup.v0[i * 3] + (k === 1 ? soup.e1[i * 3] : k === 2 ? soup.e2[i * 3] : 0)
      const y = soup.v0[i * 3 + 1] + (k === 1 ? soup.e1[i * 3 + 1] : k === 2 ? soup.e2[i * 3 + 1] : 0)
      const z = soup.v0[i * 3 + 2] + (k === 1 ? soup.e1[i * 3 + 2] : k === 2 ? soup.e2[i * 3 + 2] : 0)
      yTop = Math.max(yTop, y)
      radius = Math.max(radius, Math.hypot(x, z))
    }
  })

  const originY = yTop + 0.2
  const sample = (x: number, z: number, out: SurfaceHit) => {
    let best = Infinity
    let bestTriangle = -1
    for (let tri = 0; tri < soup.count; tri++) {
      const t = intersect(soup, tri, x, originY, z, 0, -1, 0)
      if (t > 0 && t < best) {
        best = t
        bestTriangle = tri
      }
    }
    if (bestTriangle < 0) return false
    writeHit(soup, bestTriangle, best, x, originY, z, 0, -1, 0, out)
    return true
  }

  const center: SurfaceHit = { px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 }
  const y = sample(0, 0, center) ? center.py : yTop

  return { radius, y, sample }
}

// --- Zona proibida (lacre) ---------------------------------------------------------------------

export type Footprint = { contains: (x: number, z: number) => boolean }

/** Projeção (x, z) dos triângulos das fontes, rasterizada numa grade e engordada por `margin`. O lacre é independente da tampa */
export function createFootprint(sources: readonly SurfaceSource[], halfSize: number, cells: number, margin: number): Footprint {
  const soup = buildSoup(sources)
  const cell = (halfSize * 2) / cells
  const covered = new Uint8Array(cells * cells)
  const toCell = (v: number) => Math.min(cells - 1, Math.max(0, Math.floor((v + halfSize) / cell)))

  for (let t = 0; t < soup.count; t++) {
    const o = t * 3
    const ax = soup.v0[o]
    const az = soup.v0[o + 2]
    const bx = ax + soup.e1[o]
    const bz = az + soup.e1[o + 2]
    const cx = ax + soup.e2[o]
    const cz = az + soup.e2[o + 2]

    const i0 = toCell(Math.min(ax, bx, cx))
    const i1 = toCell(Math.max(ax, bx, cx))
    const j0 = toCell(Math.min(az, bz, cz))
    const j1 = toCell(Math.max(az, bz, cz))
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -halfSize + (i + 0.5) * cell
        const z = -halfSize + (j + 0.5) * cell
        const w1 = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / (area || 1)
        const w2 = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / (area || 1)
        const inside = area !== 0 && w1 >= 0 && w2 >= 0 && w1 + w2 <= 1
        // triângulos muito finos podem não conter nenhum centro de célula: os vértices também marcam
        if (inside) covered[i + j * cells] = 1
      }
    }
    covered[toCell(ax) + toCell(az) * cells] = 1
    covered[toCell(bx) + toCell(bz) * cells] = 1
    covered[toCell(cx) + toCell(cz) * cells] = 1
  }

  const reach = Math.ceil(margin / cell)
  const grown = new Uint8Array(cells * cells)
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      if (!covered[i + j * cells]) continue
      for (let dj = -reach; dj <= reach; dj++) {
        for (let di = -reach; di <= reach; di++) {
          if (di * di + dj * dj > reach * reach) continue
          const ii = i + di
          const jj = j + dj
          if (ii >= 0 && ii < cells && jj >= 0 && jj < cells) grown[ii + jj * cells] = 1
        }
      }
    }
  }

  return { contains: (x, z) => grown[toCell(x) + toCell(z) * cells] === 1 }
}
