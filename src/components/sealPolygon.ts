// Geometria 2D mínima (plano xz do lacre) usada para achar o furo do dedo e encaixar o Monster M dentro dele.

export type Vec2 = readonly [number, number]

export function signedArea(polygon: readonly Vec2[]) {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]
    const [x2, z2] = polygon[(i + 1) % polygon.length]
    sum += x1 * z2 - x2 * z1
  }
  return sum / 2
}

export function pointInPolygon(x: number, z: number, polygon: readonly Vec2[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Cruzamento próprio entre os segmentos ab e cd (tocar na ponta não conta) */
export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const side = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

/** Polígono simples: nenhuma aresta cruza outra que não seja vizinha */
export function isSimplePolygon(polygon: readonly Vec2[]) {
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(polygon[i], polygon[(i + 1) % n], polygon[j], polygon[(j + 1) % n])) return false
    }
  }
  return true
}

/**
 * Um ponto garantidamente DENTRO do polígono (o centróide pode cair fora de um polígono côncavo, como a fenda do rebite):
 * varre linhas horizontais e usa o meio do maior trecho interno.
 */
export function findInteriorPoint(polygon: readonly Vec2[]): Vec2 | null {
  const zs = polygon.map((p) => p[1])
  const zMin = Math.min(...zs)
  const zMax = Math.max(...zs)

  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const z = zMin + (zMax - zMin) * t
    const crossings: number[] = []
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i]
      const [xj, zj] = polygon[j]
      if (zi > z !== zj > z) crossings.push(((xj - xi) * (z - zi)) / (zj - zi) + xi)
    }
    crossings.sort((a, b) => a - b)

    let best: Vec2 | null = null
    let bestSpan = 0
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const span = crossings[k + 1] - crossings[k]
      if (span > bestSpan) {
        bestSpan = span
        best = [(crossings[k] + crossings[k + 1]) / 2, z]
      }
    }
    if (best) return best
  }
  return null
}

/** O retângulo (centro, eixos unitários right/up, largura e altura) cabe inteiro dentro do polígono simples */
export function rectangleInside(polygon: readonly Vec2[], center: Vec2, right: Vec2, up: Vec2, width: number, height: number) {
  const corner = (sx: number, sy: number): Vec2 => [
    center[0] + right[0] * sx * (width / 2) + up[0] * sy * (height / 2),
    center[1] + right[1] * sx * (width / 2) + up[1] * sy * (height / 2),
  ]
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
  if (!corners.every(([x, z]) => pointInPolygon(x, z, polygon))) return false

  // sem cruzamentos entre as arestas do retângulo e as do polígono
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsCross(a, b, polygon[j], polygon[(j + 1) % polygon.length])) return false
    }
  }
  return true
}
