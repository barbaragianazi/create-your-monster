import type { Footprint, LidSampler, SideSampler, SurfaceHit } from './condensationSurface'

// Onde ficam as gotas. Gerado UMA vez por lata, com seed fixa: independe de React, dos sliders e da arte.
// Cada gota guarda ponto + normal + tangente "para cima" vindos da superfície real (ver condensationSurface).

export const DROP_STRIDE = 15
export const DROP_FIELD = {
  px: 0,
  py: 1,
  pz: 2,
  nx: 3,
  ny: 4,
  nz: 5,
  ux: 6,
  uy: 7,
  uz: 8,
  a: 9, // semieixo horizontal (tangente à volta da lata)
  b: 10, // semieixo ao longo da tangente "para cima"
  rot: 11,
  embed: 12, // enterro extra, relativo ao maior semieixo (facetas/curvatura)
  sizeExp: 13, // o slider Tamanho age como size^sizeExp: categorias grandes crescem menos
  flat: 14, // altura do elipsoide relativa ao menor semieixo (perfil baixo)
} as const

type DropClass = {
  name: 'micro' | 'small' | 'medium' | 'large'
  /** máximo de gotas da categoria (com Quantidade = 100%) */
  quota: number
  /** semieixos em unidades do modelo (raio da lata ≈ 0,83 ↔ ~33 mm) */
  radius: readonly [number, number]
  /** >1 concentra as gotas na parte pequena da faixa */
  radiusBias: number
  streakChance: number
  streakRatio: readonly [number, number]
  roundRatio: readonly [number, number]
  /** amplitude do contorno irregular (ver shader) */
  wobble: readonly [number, number]
  flat: number
  sizeExp: number
  /** fração visível = Quantidade^amountExp: quanto menor, mais a categoria resiste a "Quantidade" baixa */
  amountExp: number
  /** aceitação mínima nas zonas secas do ruído */
  dryFloor: number
}

// Ordem de geração: as maiores primeiro, para as menores preencherem o que sobra
const CLASSES: readonly DropClass[] = [
  { name: 'large', quota: 80, radius: [0.026, 0.04], radiusBias: 1.3, streakChance: 0.4, streakRatio: [1.3, 1.9], roundRatio: [0.85, 1.2], wobble: [0.1, 0.2], flat: 0.6, sizeExp: 0.6, amountExp: 0.5, dryFloor: 0.5 },
  { name: 'medium', quota: 600, radius: [0.016, 0.026], radiusBias: 1.2, streakChance: 0.25, streakRatio: [1.25, 1.7], roundRatio: [0.85, 1.2], wobble: [0.08, 0.18], flat: 0.58, sizeExp: 0.75, amountExp: 0.7, dryFloor: 0.35 },
  { name: 'small', quota: 1800, radius: [0.009, 0.016], radiusBias: 1.2, streakChance: 0.1, streakRatio: [1.2, 1.5], roundRatio: [0.85, 1.2], wobble: [0.06, 0.14], flat: 0.55, sizeExp: 0.9, amountExp: 0.85, dryFloor: 0.2 },
  { name: 'micro', quota: 14000, radius: [0.0045, 0.011], radiusBias: 1.5, streakChance: 0, streakRatio: [1, 1], roundRatio: [0.8, 1.25], wobble: [0.04, 0.1], flat: 0.5, sizeExp: 1, amountExp: 1, dryFloor: 0.18 },
]

export const MICRO_QUOTA = CLASSES.find((c) => c.name === 'micro')?.quota ?? 0
export const MACRO_QUOTA = CLASSES.filter((c) => c.name !== 'micro').reduce((sum, c) => sum + c.quota, 0)

const SEED = 0x6d6f6e73
const SPACING = 1.1 // distância mínima entre centros, em múltiplos da soma dos semieixos
const ATTEMPTS_PER_DROP = 60
const SIDE_MAX_NY = 0.6 // laterais: descarta superfícies quase horizontais (a de cima é da tampa; a de baixo não é visível)
const LID_MIN_NY = 0.6
const LID_DENSITY = 0.6 // a tampa recebe menos gotas que o corpo

export type DropGroup = {
  count: number
  data: Float32Array
  /** 4 por gota: amplitude 2ª/3ª harmônica e fases do contorno irregular */
  shape: Float32Array
  /** limiar de Quantidade em que cada gota aparece; ordenado crescente, então "N primeiras" = Quantidade */
  thresholds: Float32Array
}

export type CondensationLayout = { micro: DropGroup; macro: DropGroup }

/** Quantas gotas do grupo aparecem com essa Quantidade (0–1) */
export function visibleCount(group: DropGroup, amount: number) {
  let lo = 0
  let hi = group.count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (group.thresholds[mid] < amount) lo = mid + 1
    else hi = mid
  }
  return lo
}

// --- utilitários determinísticos ---------------------------------------------------------------

function mulberry32(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lattice(ix: number, iy: number, iz: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ SEED
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// value noise 3D em [0, 1]: só aritmética inteira + interpolação, igual em qualquer máquina
function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  return lerp(
    lerp(lerp(lattice(ix, iy, iz), lattice(ix + 1, iy, iz), sx), lerp(lattice(ix, iy + 1, iz), lattice(ix + 1, iy + 1, iz), sx), sy),
    lerp(lerp(lattice(ix, iy, iz + 1), lattice(ix + 1, iy, iz + 1), sx), lerp(lattice(ix, iy + 1, iz + 1), lattice(ix + 1, iy + 1, iz + 1), sx), sy),
    sz,
  )
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// --- geração -----------------------------------------------------------------------------------

type Grid = { cell: number; nx: number; ny: number; nz: number; head: Int32Array; reach: number }

export function generateLayout(side: SideSampler, lid: LidSampler | null, tab: Footprint | null): CondensationLayout {
  const random = mulberry32(SEED)
  const range = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * random()
  const noiseOffset = Array.from({ length: 9 }, () => random() * 100)

  // Manchas úmidas, vazios e clusters: ruído 3D em três escalas (o mesmo vale para todas as categorias)
  const wetness = (x: number, y: number, z: number) => {
    const f =
      0.5 * noise3(x * 2.4 + noiseOffset[0], y * 2.4 + noiseOffset[1], z * 2.4 + noiseOffset[2]) +
      0.32 * noise3(x * 7 + noiseOffset[3], y * 7 + noiseOffset[4], z * 7 + noiseOffset[5]) +
      0.18 * noise3(x * 16 + noiseOffset[6], y * 16 + noiseOffset[7], z * 16 + noiseOffset[8])
    return smoothstep(0.38, 0.62, f)
  }

  const total = CLASSES.reduce((sum, c) => sum + c.quota, 0)
  const px = new Float32Array(total)
  const py = new Float32Array(total)
  const pz = new Float32Array(total)
  const extent = new Float32Array(total)
  const next = new Int32Array(total)

  // Grade espacial por categoria (células proporcionais ao tamanho): a checagem de vizinhos custa ~O(1)
  const gridMin = { x: -side.radiusMax - 0.1, y: side.yMin - 0.1, z: -side.radiusMax - 0.1 }
  const extentMax = (c: DropClass) => c.radius[1] * Math.max(c.streakRatio[1], c.roundRatio[1])
  const grids: Grid[] = CLASSES.map((c) => {
    const cell = 2 * extentMax(c) * SPACING
    const nx = Math.ceil((side.radiusMax * 2 + 0.2) / cell) + 1
    const ny = Math.ceil((side.yMax - side.yMin + 0.2) / cell) + 1
    return { cell, nx, ny, nz: nx, head: new Int32Array(nx * ny * nx).fill(-1), reach: extentMax(c) }
  })
  const cellOf = (grid: Grid, x: number, y: number, z: number) => {
    const i = Math.min(grid.nx - 1, Math.max(0, Math.floor((x - gridMin.x) / grid.cell)))
    const j = Math.min(grid.ny - 1, Math.max(0, Math.floor((y - gridMin.y) / grid.cell)))
    const k = Math.min(grid.nz - 1, Math.max(0, Math.floor((z - gridMin.z) / grid.cell)))
    return [i, j, k] as const
  }

  // Proporção de tentativas na tampa para que a densidade por área lá seja LID_DENSITY × a do corpo
  // (lateral: amostra uniforme em ângulo × altura com aceitação ∝ área; ver `weight` abaixo)
  const weightMax = side.radiusMax / Math.sqrt(1 - SIDE_MAX_NY * SIDE_MAX_NY)
  const lidArea = lid ? Math.PI * lid.radius * lid.radius : 0
  const lidOdds = lid ? (LID_DENSITY * lidArea) / (2 * Math.PI * (side.yMax - side.yMin) * weightMax) : 0
  const lidShare = lidOdds / (1 + lidOdds)

  const hit: SurfaceHit = { px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 }
  type Placed = { data: Float32Array; shape: Float32Array; count: number }
  const placedByClass: Placed[] = []
  let globalIndex = 0

  for (const cls of CLASSES) {
    const placed: Placed = {
      data: new Float32Array(cls.quota * DROP_STRIDE),
      shape: new Float32Array(cls.quota * 4),
      count: 0,
    }
    const grid = grids[CLASSES.indexOf(cls)]

    for (let attempt = 0; attempt < cls.quota * ATTEMPTS_PER_DROP && placed.count < cls.quota; attempt++) {
      const onLid = lid !== null && random() < lidShare

      // 1) candidato → ponto real da superfície
      let dryness: number
      if (onLid && lid) {
        const r = lid.radius * Math.sqrt(random())
        const angle = random() * Math.PI * 2
        const x = r * Math.cos(angle)
        const z = r * Math.sin(angle)
        dryness = wetness(x, lid.y, z)
        if (random() > cls.dryFloor + (1 - cls.dryFloor) * dryness) continue
        if (tab?.contains(x, z)) continue
        if (!lid.sample(x, z, hit) || hit.ny < LID_MIN_NY) continue
      } else {
        const theta = random() * Math.PI * 2
        const y = side.yMin + (side.yMax - side.yMin) * random()
        const guess = side.radiusMax * 0.95
        dryness = wetness(guess * Math.cos(theta), y, guess * Math.sin(theta))
        if (random() > cls.dryFloor + (1 - cls.dryFloor) * dryness) continue
        if (!side.sample(theta, y, hit) || Math.abs(hit.ny) > SIDE_MAX_NY) continue

        // área real por (θ, y): r / n_r (n_r = componente radial da normal); aceitar ∝ isso deixa a densidade uniforme por área
        const weight = Math.hypot(hit.px, hit.pz) / Math.hypot(hit.nx, hit.nz) / weightMax
        if (random() > weight) continue
      }

      // 2) forma
      const a = cls.radius[0] + (cls.radius[1] - cls.radius[0]) * Math.pow(random(), cls.radiusBias)
      const streak = !onLid && random() < cls.streakChance
      const ratio = streak ? range(cls.streakRatio) : range(cls.roundRatio)
      const b = a * ratio
      const ext = Math.max(a, b)

      // 3) espaçamento contra as gotas já aceitas (todas as categorias)
      let free = true
      for (let g = 0; g < grids.length && free; g++) {
        const other = grids[g]
        const reach = Math.ceil(((ext + other.reach) * SPACING) / other.cell)
        const [ci, cj, ck] = cellOf(other, hit.px, hit.py, hit.pz)
        for (let i = Math.max(0, ci - reach); i <= Math.min(other.nx - 1, ci + reach) && free; i++) {
          for (let j = Math.max(0, cj - reach); j <= Math.min(other.ny - 1, cj + reach) && free; j++) {
            for (let k = Math.max(0, ck - reach); k <= Math.min(other.nz - 1, ck + reach); k++) {
              for (let d = other.head[i + other.nx * (j + other.ny * k)]; d >= 0; d = next[d]) {
                const min = (ext + extent[d]) * SPACING
                const dx = hit.px - px[d]
                const dy = hit.py - py[d]
                const dz = hit.pz - pz[d]
                if (dx * dx + dy * dy + dz * dz < min * min) {
                  free = false
                  break
                }
              }
              if (!free) break
            }
          }
        }
      }
      if (!free) continue

      // 4) tangente "para cima" (gravidade) projetada no plano da superfície; na tampa não há "para cima"
      const upY = onLid ? 0 : 1
      const upZ = onLid ? 1 : 0
      const along = hit.ny * upY + hit.nz * upZ
      let ux = -hit.nx * along
      let uy = upY - hit.ny * along
      let uz = upZ - hit.nz * along
      const length = Math.hypot(ux, uy, uz)
      if (length < 1e-4) {
        ux = 1
        uy = 0
        uz = 0
      } else {
        ux /= length
        uy /= length
        uz /= length
      }

      const o = placed.count * DROP_STRIDE
      placed.data[o] = hit.px
      placed.data[o + 1] = hit.py
      placed.data[o + 2] = hit.pz
      placed.data[o + 3] = hit.nx
      placed.data[o + 4] = hit.ny
      placed.data[o + 5] = hit.nz
      placed.data[o + 6] = ux
      placed.data[o + 7] = uy
      placed.data[o + 8] = uz
      placed.data[o + 9] = a
      placed.data[o + 10] = b
      placed.data[o + 11] = onLid ? random() * Math.PI * 2 : (random() * 2 - 1) * 0.25
      placed.data[o + 12] = onLid ? 0.03 : 0.1
      placed.data[o + 13] = cls.sizeExp
      placed.data[o + 14] = cls.flat

      const s = placed.count * 4
      placed.shape[s] = range(cls.wobble)
      placed.shape[s + 1] = range(cls.wobble) * 0.7
      placed.shape[s + 2] = random() * Math.PI * 2
      placed.shape[s + 3] = random() * Math.PI * 2

      px[globalIndex] = hit.px
      py[globalIndex] = hit.py
      pz[globalIndex] = hit.pz
      extent[globalIndex] = ext
      const [ci, cj, ck] = cellOf(grid, hit.px, hit.py, hit.pz)
      const cellIndex = ci + grid.nx * (cj + grid.ny * ck)
      next[globalIndex] = grid.head[cellIndex]
      grid.head[cellIndex] = globalIndex

      placed.count++
      globalIndex++
    }
    placedByClass.push(placed)
  }

  // Cada gota ganha um limiar: aparece quando Quantidade^amountExp cobre sua posição na fila da categoria.
  // Ordenadas por limiar, "as N primeiras" já respeitam a proporção entre categorias em qualquer Quantidade.
  const assemble = (classes: readonly DropClass[]): DropGroup => {
    const entries: { placed: Placed; index: number; threshold: number }[] = []
    for (const cls of classes) {
      const placed = placedByClass[CLASSES.indexOf(cls)]
      for (let i = 0; i < placed.count; i++) {
        entries.push({ placed, index: i, threshold: Math.pow(i / placed.count, 1 / cls.amountExp) })
      }
    }
    entries.sort((p, q) => p.threshold - q.threshold)

    const group: DropGroup = {
      count: entries.length,
      data: new Float32Array(entries.length * DROP_STRIDE),
      shape: new Float32Array(entries.length * 4),
      thresholds: new Float32Array(entries.length),
    }
    entries.forEach(({ placed, index, threshold }, i) => {
      group.data.set(placed.data.subarray(index * DROP_STRIDE, (index + 1) * DROP_STRIDE), i * DROP_STRIDE)
      group.shape.set(placed.shape.subarray(index * 4, (index + 1) * 4), i * 4)
      group.thresholds[i] = threshold
    })
    return group
  }

  return {
    micro: assemble(CLASSES.filter((c) => c.name === 'micro')),
    macro: assemble(CLASSES.filter((c) => c.name !== 'micro')),
  }
}
