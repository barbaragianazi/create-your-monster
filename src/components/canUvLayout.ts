import type { BufferGeometry } from 'three'

/*
 * O canvas de composição (`canvas` de ArtworkTarget) é a lata desenrolada e IDEAL: x = arco, linha = yToV(y).
 * O UV do corpo no GLB não é exatamente isso. Medido nos vértices da parede:
 *   - as duas cópias de vértice da costura frontal (u ≈ 0 e u ≈ 1) têm o MESMO ponto 3D, mas v diferente (até ~0,0016 = 4,7 px
 *     em 2928): o UV é helicoidal, a textura "escorrega" verticalmente uma volta inteira. Uma única textura contínua em u
 *     não consegue representar isso: o mesmo texel teria que valer duas alturas → degrau vertical na frente da lata;
 *   - v também oscila suavemente ao longo da volta (± ~14 px), e o intervalo em u entre as duas cópias da costura não é 1.
 *
 * Em vez de mexer no GLB ou no UV, a textura enviada à GPU é a composição REPROJETADA para o espaço UV do GLB: cada coluna
 * de vértices ganha o deslocamento/escala vertical que faz a arte cair exatamente no ponto da superfície pedido. Como as
 * duas cópias da costura são o mesmo ponto físico com alinhamentos diferentes, elas precisam de colunas de textura
 * DIFERENTES: abre-se uma calha (SEAM_GUTTER colunas) no centro frontal da textura, preenchida com a continuação da arte
 * de cada lado, cada uma alinhada à sua cópia. O filtro bilinear/mipmap nunca lê o outro alinhamento.
 */

/** Colunas da textura reservadas na costura frontal (metade para cada cópia de vértice). Par, e pequena o bastante para não custar resolução */
export const SEAM_GUTTER = 32

/** Largura, em px da textura, de cada faixa vertical reprojetada (o deslocamento vertical varia devagar ao longo da volta) */
const STRIP_WIDTH = 8

/** Altura, em px, das bandas de topo e base pintadas sem correção vertical (maior que o deslocamento máximo, ~20 px) */
const EDGE_BAND = 48

// Um vértice pertence à parede se estiver no raio da lata e seu v seguir o mapeamento ideal; o fundo/ombro (v muito diferente) fica de fora
const RADIUS_TOLERANCE = 1e-3
const WALL_V_TOLERANCE = 0.015
// Colunas de vértices distam ~1/32 em u; uma coluna inteira varia bem menos que isto
const COLUMN_GAP = 0.01

/** Como uma coluna de vértices do GLB (mesmo u) se afasta do mapeamento ideal: v_real = scale · v_ideal + offset */
export type UvColumn = { u: number; scale: number; offset: number }

export type BodyUvLayout = {
  /** u da primeira e da última coluna (as duas cópias da costura frontal); uEnd − uStart ≠ 1 no GLB */
  uStart: number
  uEnd: number
  /** ordenadas por u, incluindo as duas cópias da costura */
  columns: readonly UvColumn[]
}

/** Sem dados do GLB: mapeamento ideal, sem correção */
export const IDENTITY_UV_LAYOUT: BodyUvLayout = {
  uStart: 0,
  uEnd: 1,
  columns: [
    { u: 0, scale: 1, offset: 0 },
    { u: 1, scale: 1, offset: 0 },
  ],
}

export type UvWallModel = {
  /** raio da parede cilíndrica, em unidades do modelo */
  radius: number
  /** altura máxima (y) da parede; acima começa o ombro, que não segue o mapeamento linear */
  wallTop: number
  /** v ideal (linha do canvas, 0..1) para uma altura y */
  yToV: (y: number) => number
}

/** Lê o UV do corpo (sem alterá-lo) e mede, por coluna de vértices da parede, o desvio em relação a `yToV` */
export function measureBodyUv(geometry: BufferGeometry, wall: UvWallModel): BodyUvLayout {
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  if (!position || !uv) return IDENTITY_UV_LAYOUT

  type Sample = { u: number; ideal: number; actual: number }
  const samples: Sample[] = []
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    if (y > wall.wallTop + 1e-6) continue
    if (Math.abs(Math.hypot(position.getX(i), position.getZ(i)) - wall.radius) > RADIUS_TOLERANCE) continue
    const ideal = wall.yToV(y)
    const actual = uv.getY(i)
    if (Math.abs(actual - ideal) > WALL_V_TOLERANCE) continue
    samples.push({ u: uv.getX(i), ideal, actual })
  }
  samples.sort((a, b) => a.u - b.u)

  const groups: Sample[][] = []
  for (const sample of samples) {
    const last = groups[groups.length - 1]
    if (last && sample.u - last[last.length - 1].u < COLUMN_GAP) last.push(sample)
    else groups.push([sample])
  }
  if (groups.length < 2) return IDENTITY_UV_LAYOUT

  const columns = groups.map((group): UvColumn => {
    const n = group.length
    const mean = (pick: (s: Sample) => number) => group.reduce((sum, s) => sum + pick(s), 0) / n
    const u = mean((s) => s.u)
    const ideal = mean((s) => s.ideal)
    const actual = mean((s) => s.actual)
    // mínimos quadrados de actual = scale · ideal + offset
    let covariance = 0
    let variance = 0
    for (const s of group) {
      covariance += (s.ideal - ideal) * (s.actual - actual)
      variance += (s.ideal - ideal) ** 2
    }
    const scale = variance > 1e-12 ? covariance / variance : 1
    return { u, scale, offset: actual - scale * ideal }
  })

  return { uStart: columns[0].u, uEnd: columns[columns.length - 1].u, columns }
}

/*
 * Transformação u → textura. A malha cobre (uEnd − uStart) em u; ela deve ocupar exatamente `textureWidth − SEAM_GUTTER`
 * colunas, começando à direita da calha (que fica centrada em x = textureWidth / 2, a frente).
 */
export function uvTextureTransform(layout: BodyUvLayout, textureWidth: number, gutter = SEAM_GUTTER) {
  const repeat = (textureWidth - gutter) / (textureWidth * (layout.uEnd - layout.uStart))
  const offset = (textureWidth + gutter) / 2 / textureWidth - repeat * layout.uStart
  return { repeat, offset }
}

// scale/offset da coluna em `u`, interpolados entre as colunas de vértices vizinhas (a malha interpola linearmente entre elas)
function columnAt(columns: readonly UvColumn[], u: number) {
  let next = 1
  while (next < columns.length - 1 && columns[next].u < u) next++
  const a = columns[next - 1]
  const b = columns[next]
  const t = Math.min(1, Math.max(0, (u - a.u) / (b.u - a.u)))
  return { scale: a.scale + (b.scale - a.scale) * t, offset: a.offset + (b.offset - a.offset) * t }
}

/*
 * UV do GLB ↔ composição ideal (o que projectToUv faz, nas duas direções, para UM ponto). Serve à manipulação direta: o raycast
 * na lata devolve o UV do GLB, e é preciso saber que ponto da composição está sendo mostrado ali (e o inverso, para desenhar
 * o overlay sobre a superfície). A malha cobre uEnd − uStart em u; a volta começa na frente (x = width / 2) e as bordas da
 * composição (x = 0 e x = width) são a mesma linha, atrás (ver uvTextureTransform e projectToUv).
 */
export function uvToComposition(layout: BodyUvLayout, u: number, v: number, width: number, height: number) {
  const turn = (u - layout.uStart) / (layout.uEnd - layout.uStart)
  const { scale, offset } = columnAt(layout.columns, u)
  return { x: ((((turn + 0.5) % 1) + 1) % 1) * width, y: ((v - offset) / scale) * height }
}

export function compositionToUv(layout: BodyUvLayout, x: number, y: number, width: number, height: number) {
  const turn = (((x / width - 0.5) % 1) + 1) % 1
  const u = layout.uStart + turn * (layout.uEnd - layout.uStart)
  const { scale, offset } = columnAt(layout.columns, u)
  return { u, v: scale * (y / height) + offset }
}

/*
 * Reprojeta a composição ideal (`source`, largura = circunferência) para o espaço UV do GLB (`target`).
 * Horizontal: cada metade do canvas (esquerda/direita da frente) é comprimida em `ratio` e afastada da frente, abrindo a calha;
 * as bordas do canvas (atrás) caem exatamente nas bordas da textura, onde ela se repete. A arte continua nos dois lados da
 * calha (a composição é periódica), então a calha nunca mostra vazio.
 * Vertical: cada faixa recebe o scale/offset medido para a sua coluna (calha: o da cópia de costura mais próxima).
 *
 * `resolution` (0..1) é o tamanho do destino em relação ao tamanho pleno (a prévia, durante arrastos, usa 0,5): a calha, as faixas e
 * as bandas encolhem junto, então a razão repeat/offset da textura (uvTextureTransform) é a mesma em qualquer resolução.
 */
export function projectToUv(source: HTMLCanvasElement, target: HTMLCanvasElement, layout: BodyUvLayout, resolution = 1) {
  const ctx = target.getContext('2d')
  if (!ctx) return

  const { width, height } = target
  const gutter = SEAM_GUTTER * resolution
  const stripWidth = STRIP_WIDTH * resolution
  const edgeBand = EDGE_BAND * resolution
  // px da origem por px do destino na vertical (1 em resolução plena)
  const sourcePerRow = source.height / height
  const half = width / 2
  const meshWidth = width - gutter
  const ratio = meshWidth / source.width
  const meshStart = half + gutter / 2
  const span = layout.uEnd - layout.uStart

  ctx.clearRect(0, 0, width, height)

  // O deslocamento vertical deixa descobertas as pontas de cada faixa (topo e base): cobre-as com a arte sem correção,
  // que ali é só o fundo do corpo (o deslocamento é de poucos px e o UV amostra essas linhas por clamp)
  for (const [y, bandHeight] of [[0, edgeBand], [height - edgeBand, edgeBand]]) {
    for (const piece of [0, 1]) {
      ctx.drawImage(
        source,
        (piece * (half - gutter)) / ratio, y * sourcePerRow, half / ratio, bandHeight * sourcePerRow,
        piece * half, y, half, bandHeight,
      )
    }
  }

  for (let x = 0; x < width; x += stripWidth) {
    const piece = x + stripWidth / 2 < half ? 0 : 1
    // coluna da malha sob o centro da faixa (0 = primeira cópia da costura, meshWidth = segunda; fora disso é calha)
    const meshColumn = piece === 0 ? x + stripWidth / 2 + meshWidth / 2 : x + stripWidth / 2 - meshStart
    const u = layout.uStart + (Math.min(meshWidth, Math.max(0, meshColumn)) / meshWidth) * span
    const { scale, offset } = columnAt(layout.columns, u)

    // origem = a mesma faixa do canvas ideal (a compressão horizontal é a inversa do destino), destino em colunas inteiras
    ctx.drawImage(
      source,
      (x - piece * gutter) / ratio, 0, stripWidth / ratio, source.height,
      x, offset * height, stripWidth, scale * height,
    )
  }
}
