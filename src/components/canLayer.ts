import { drawWrapped } from './canWrap'
import { createCanvas } from './canvasUtils'

/*
 * Camada "posicionável" do Canvas: uma imagem já colorida (canvas) que pode ser desenhada uma vez
 * (single) ou como estampa contínua ao redor da lata (repeat). Não conhece patterns nem a geometria da
 * lata: quem chama entrega o ponto de ancoragem e a escala em px. A futura custom artwork reutiliza isto.
 */

export type LayerMode = 'single' | 'repeat'

export type LayerPlacement = {
  mode: LayerMode
  /** 0..1 */
  opacity: number
  /** multiplicador sobre a altura base da camada (repeat: menor = mais repetições) */
  scale: number
  /** graus, sentido horário */
  rotation: number
  /** deslocamento horizontal a partir do centro frontal, em unidades do modelo */
  x: number
  /** posição vertical do centro, em unidades do modelo (y do GLB, positivo = para cima) */
  y: number
}

export type LayerGeometry = {
  /** altura, em unidades do modelo, com scale = 1 */
  baseHeight: number
  pxPerUnit: number
  /** ponto do canvas, em px, onde fica o centro da instância (single) ou de um tile (repeat) */
  anchorX: number
  anchorY: number
}

// Versões reduzidas de cada imagem, por tamanho (poucas: cópias do mesmo sticker podem ter tamanhos diferentes,
// mas arrastar um slider gera muitos tamanhos). Somem junto com a imagem (WeakMap).
const MAX_SCALED_PER_SOURCE = 6
const scaledCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>()

/** Chamar quando o conteúdo de `source` for redesenhado no mesmo canvas */
export function invalidateLayerSource(source: HTMLCanvasElement) {
  scaledCache.delete(source)
}

function resize(from: HTMLCanvasElement, width: number, height: number) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(from, 0, 0, width, height)
  }
  return canvas
}

// Reduz em passos de 1/2 (o filtro bilinear sozinho serrilha em reduções grandes, ex.: riscos finos)
function getScaled(source: HTMLCanvasElement, width: number, height: number) {
  if (width >= source.width && height >= source.height) return source

  const key = `${width}x${height}`
  const cached = scaledCache.get(source)?.get(key)
  if (cached) return cached

  let current = source
  while (current.width >= width * 2 && current.height >= height * 2) {
    current = resize(current, Math.floor(current.width / 2), Math.floor(current.height / 2))
  }
  const canvas = resize(current, width, height)

  const sizes = scaledCache.get(source) ?? new Map<string, HTMLCanvasElement>()
  if (sizes.size >= MAX_SCALED_PER_SOURCE) sizes.delete(sizes.keys().next().value!) // o mais antigo
  sizes.set(key, canvas)
  scaledCache.set(source, sizes)
  return canvas
}

const wrapAngle = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

export type RepeatLattice = {
  /** altura do tile em px do canvas */
  tileHeight: number
  /** graus, sentido horário */
  rotation: number
  /** quantos tiles lado a lado cabem na circunferência */
  repeats: number
}

/*
 * Grade de tiles que fecha exatamente a volta da lata (sem emenda na costura do UV).
 * Uma grade de tiles k·(aspect × 1) girada em θ tem período horizontal W = |canvas.width| se, e só se,
 * m·u + n·v = (W, 0) para inteiros m, n, onde u e v são os lados do tile já girado. Isso dá
 *   θ = −atan2(n, m·aspect)   e   k = W / hypot(m·aspect, n).
 * Entre todos os (m, n) escolhe-se o mais próximo da escala e da rotação pedidas. Com θ = 0 isso é
 * "número inteiro de tiles por volta" (n = 0). Com rotação, o ângulo efetivo anda em degraus.
 */
export function solveSeamlessLattice(
  aspect: number,
  circumference: number,
  desiredTileHeight: number,
  desiredRotation: number,
): RepeatLattice {
  const target = circumference / desiredTileHeight
  const desiredAngle = (desiredRotation * Math.PI) / 180
  const maxN = Math.ceil(target * 2)
  const maxM = Math.ceil((target * 2) / aspect)

  let best = { cost: Infinity, m: 1, n: 0 }
  for (let m = -maxM; m <= maxM; m++) {
    for (let n = -maxN; n <= maxN; n++) {
      const length = Math.hypot(m * aspect, n)
      if (length < target / 2 || length > target * 2) continue
      const scaleError = Math.log(length / target)
      const angleError = wrapAngle(-Math.atan2(n, m * aspect) - desiredAngle)
      const cost = scaleError ** 2 + 2 * angleError ** 2
      if (cost < best.cost) best = { cost, m, n }
    }
  }

  const length = Math.hypot(best.m * aspect, best.n)
  return {
    tileHeight: circumference / length,
    rotation: (-Math.atan2(best.n, best.m * aspect) * 180) / Math.PI,
    repeats: length / aspect,
  }
}

function drawSingle(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  { opacity, scale, rotation }: LayerPlacement,
  { baseHeight, pxPerUnit, anchorX, anchorY }: LayerGeometry,
) {
  const { width: canvasWidth, height: canvasHeight } = ctx.canvas
  const height = baseHeight * scale * pxPerUnit
  const width = (height * source.width) / source.height
  const reach = Math.hypot(width, height) / 2
  const image = getScaled(source, Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))

  if (anchorY + reach < 0 || anchorY - reach > canvasHeight) return

  ctx.save()
  ctx.globalAlpha = opacity
  drawWrapped(canvasWidth, anchorX - reach, anchorX + reach, (offset) => {
    ctx.save()
    ctx.translate(anchorX + offset, anchorY)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(image, -width / 2, -height / 2, width, height)
    ctx.restore()
  })
  ctx.restore()
}

function drawRepeat(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  { opacity, scale, rotation }: LayerPlacement,
  { baseHeight, pxPerUnit, anchorX, anchorY }: LayerGeometry,
) {
  const aspect = source.width / source.height
  const lattice = solveSeamlessLattice(aspect, ctx.canvas.width, baseHeight * scale * pxPerUnit, rotation)
  const tileHeight = lattice.tileHeight
  const tileWidth = tileHeight * aspect

  // tile pré-reduzido para o tamanho final; a diferença de arredondamento (< 1 px) sai na matriz do pattern
  const tile = getScaled(source, Math.max(1, Math.round(tileWidth)), Math.max(1, Math.round(tileHeight)))
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return

  pattern.setTransform(
    new DOMMatrix()
      .translate(anchorX, anchorY)
      .rotate(lattice.rotation)
      .scale(tileWidth / tile.width, tileHeight / tile.height)
      .translate(-tile.width / 2, -tile.height / 2),
  )

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  placement: LayerPlacement,
  geometry: LayerGeometry,
) {
  if (placement.opacity <= 0 || source.width === 0 || source.height === 0) return
  if (placement.mode === 'repeat') drawRepeat(ctx, source, placement, geometry)
  else drawSingle(ctx, source, placement, geometry)
}
