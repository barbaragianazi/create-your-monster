import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type BufferGeometry, type MeshStandardMaterial } from 'three'
import mSvg from '../assets/branding/monster-m.svg?raw'
import wordmarkSvg from '../assets/branding/monster-wordmark.svg?raw'
import energySvg from '../assets/branding/energy.svg?raw'
import { paintBodyFill, type BodyFill } from './canBodyFill'
import { drawFrontLabel } from './canFrontLabel'
import { drawLayer, solveSeamlessLattice, type RepeatLattice } from './canLayer'
import { paintCustomArtwork, type CustomArtwork } from './canCustomArtworkLayer'
import { paintShoulderFill } from './canShoulder'
import { resolveSugarLabel, type SugarConfig } from './canSugarLabel'
import { stickerBaseHeight, type Sticker } from './canStickers'
import { loadPattern, PATTERN_DEFS, type LoadedPattern, type PatternConfig } from './canPattern'
import { drawTextElement, TEXT_ELEMENTS, type TextsConfig } from './canText'
import { measureBodyUv, projectToUv, uvTextureTransform, IDENTITY_UV_LAYOUT, SEAM_GUTTER, type BodyUvLayout } from './canUvLayout'
import { drawWrapped } from './canWrap'
import { createCanvas, svgToImage } from './canvasUtils'

/*
 * Mapeamento UV do corpo (Material.005), medido no GLB:
 *   u = 0.627 - θ/360   (θ = atan2(z, x) no espaço local do mesh; percorre a circunferência 1x)
 *   v = 0.5575 - 0.267 * y   (v cresce para baixo, convenção glTF → flipY = false)
 * A costura do UV (u ≈ 0/1) cai exatamente na frente da câmera inicial por causa da rotação de ~135° do nó, então o
 * canvas de composição tem o SEU CENTRO na frente e as bordas (x = 0 / x = largura, a mesma linha) atrás.
 *
 * Esse é o mapeamento IDEAL, usado para posicionar tudo. O UV real do GLB desvia dele (as duas cópias da costura frontal
 * diferem em u e em v); quem corrige isso é canUvLayout.projectToUv, que reprojeta a composição para o UV do GLB.
 */
const CAN_RADIUS = 0.834
const V_PER_UNIT_Y = 0.267
const V_AT_Y0 = 0.5575

/*
 * Ombro/chanfro (acima de y ≈ 1.657): o raio diminui e v continua proporcional ao comprimento de arco
 * ao longo do perfil, então y → v deixa de ser linear. Perfil medido no GLB: [y, raio, v].
 */
const CHAMFER_PROFILE = [
  [1.657, 0.834, 0.1151],
  [1.691, 0.824, 0.1057],
  [1.75, 0.797, 0.0887],
  [1.831, 0.745, 0.0624],
  [1.87, 0.72, 0.0494],
  [1.907, 0.695, 0.0367],
  [1.957, 0.679, 0.0216],
  [1.983, 0.671, 0.0138],
  [2.075, 0.668, -0.0133],
] as const

function interpolateProfile(y: number, column: 1 | 2) {
  const last = CHAMFER_PROFILE[CHAMFER_PROFILE.length - 1]
  if (y >= last[0]) return last[column]
  for (let i = 1; i < CHAMFER_PROFILE.length; i++) {
    const next = CHAMFER_PROFILE[i]
    if (y <= next[0]) {
      const prev = CHAMFER_PROFILE[i - 1]
      return prev[column] + ((y - prev[0]) / (next[0] - prev[0])) * (next[column] - prev[column])
    }
  }
  return last[column]
}

/** linha do canvas (0..1) para uma altura y do modelo */
export function yToV(y: number) {
  return y <= CHAMFER_PROFILE[0][0] ? V_AT_Y0 - V_PER_UNIT_Y * y : interpolateProfile(y, 2)
}

/** inverso de yToV: altura y do modelo para uma linha do canvas (0..1); acima do ombro (v menor que o do perfil) fica no topo do perfil */
export function vToY(v: number) {
  if (v >= CHAMFER_PROFILE[0][2]) return (V_AT_Y0 - v) / V_PER_UNIT_Y
  for (let i = 1; i < CHAMFER_PROFILE.length; i++) {
    const prev = CHAMFER_PROFILE[i - 1]
    const next = CHAMFER_PROFILE[i]
    if (v >= next[2]) return prev[0] + ((v - prev[2]) / (next[2] - prev[2])) * (next[0] - prev[0])
  }
  return CHAMFER_PROFILE[CHAMFER_PROFILE.length - 1][0]
}

/** raio da lata na altura y */
function radiusAtY(y: number) {
  return y <= CHAMFER_PROFILE[0][0] ? CAN_RADIUS : interpolateProfile(y, 1)
}

/*
 * Limites verticais da parede cilíndrica (y do GLB). Acima de WALL_TOP_Y começa o ombro (o raio diminui); abaixo de
 * WALL_BOTTOM_Y (última linha de vértices da parede, medida no GLB) o corpo dobra para o fundo e o canvas acaba em v = 1.
 * Nessas duas faixas a arte sofre mais deformação; o gabarito de custom artwork as marca (canGuides).
 */
export const WALL_TOP_Y = CHAMFER_PROFILE[0][0]
export const WALL_BOTTOM_Y = -1.576

/*
 * Largura da composição (a lata desenrolada). São três canvases desse tamanho (composição, UV e prévia) mais a textura na GPU com
 * mipmaps: com 4096 são ~150 MB, o que derruba o Safari e muitos Androids de entrada. Aparelhos de toque usam 2048: a lata ocupa
 * poucas centenas de px na tela deles, então a nitidez é a mesma a olho nu. ?texture=2048|4096 força um valor (teste).
 * Tudo o mais (posições, escalas, gabaritos) deriva desta constante, então a arte sai igual nos dois tamanhos.
 */
function pickTextureWidth() {
  if (typeof window === 'undefined') return 4096
  const forced = Number(new URLSearchParams(window.location.search).get('texture'))
  if (forced === 2048 || forced === 4096) return forced
  return window.matchMedia('(pointer: coarse)').matches ? 2048 : 4096
}

// 1 px do canvas = mesmo comprimento na horizontal e na vertical (arte sem distorção)
export const TEXTURE_WIDTH = pickTextureWidth()
export const PX_PER_UNIT = TEXTURE_WIDTH / (2 * Math.PI * CAN_RADIUS)
export const TEXTURE_HEIGHT = Math.round(PX_PER_UNIT / V_PER_UNIT_Y)

/*
 * ÚNICA conversão (x, y) em unidades do modelo → canvas de composição. x = 0 é o centro frontal (centro do canvas);
 * as bordas do canvas (x = 0 e x = largura) são a mesma linha, atrás. Tudo que é posicionado (elementos, textos, selo) e o
 * gabarito de custom artwork passam por aqui, então o gabarito nunca diverge da renderização.
 */
export function surfaceToCanvas(x: number, y: number, canvasWidth = TEXTURE_WIDTH, canvasHeight = TEXTURE_HEIGHT) {
  return {
    x: canvasWidth / 2 + x * PX_PER_UNIT,
    y: yToV(y) * canvasHeight,
    /** compensa o estreitamento horizontal onde o raio diminui (ombro): raio máx / raio local */
    stretchX: CAN_RADIUS / radiusAtY(y),
  }
}

export type ArtworkElementConfig = {
  visible: boolean
  color: string
  /** multiplicador sobre o tamanho base do elemento */
  scale: number
  /** deslocamento horizontal a partir do centro frontal, em unidades do modelo (ao longo da superfície) */
  x: number
  /** posição vertical do centro do elemento, em unidades do modelo (y do GLB, positivo = para cima) */
  y: number
  /** graus, sentido horário, em torno do centro do elemento */
  rotation: number
}

/** Limites dos controles DEV e da manipulação direta (uma só fonte) */
export const ARTWORK_LIMITS = {
  scale: { min: 0.2, max: 2.5 },
  x: { min: -2.6, max: 2.6 },
  y: { min: -1.6, max: 2 },
  rotation: { min: -180, max: 180 },
} as const

export type InnerEffectType = 'none' | 'left' | 'right'

/** Faixa de uma segunda cor colada na borda interna das garras do M (nunca sai da silhueta) */
export type InnerEffect = {
  type: InnerEffectType
  color: string
  /** 0..1: opacidade e largura da faixa */
  intensity: number
}

export type ArtworkConfig = {
  m: ArtworkElementConfig & { effect: InnerEffect }
  wordmark: ArtworkElementConfig
  energy: ArtworkElementConfig
}

export type ArtworkElementId = keyof ArtworkConfig

export type ArtworkElementDef = {
  id: ArtworkElementId
  label: string
  svg: string
  /** preenchimento do SVG que representa a cor "principal" (o contorno escuro é preservado) */
  sourceFill: string
  /** preenchimento do contorno; se existir, o interior (sourceFill) serve de máscara para efeitos internos */
  outlineFill?: string
  aspect: number
  /** altura, em unidades do modelo, com scale = 1 */
  baseHeight: number
}

// Ordem = ordem de desenho (de baixo para cima)
export const ARTWORK_ELEMENTS: readonly ArtworkElementDef[] = [
  {
    id: 'm',
    label: 'Logo',
    svg: mSvg,
    sourceFill: '#AEC90B',
    outlineFill: '#1D1D1B',
    aspect: 80 / 115,
    baseHeight: 2.0,
  },
  { id: 'wordmark', label: 'MONSTER', svg: wordmarkSvg, sourceFill: 'white', aspect: 185 / 35, baseHeight: 0.36 },
  { id: 'energy', label: 'ENERGY', svg: energySvg, sourceFill: 'white', aspect: 144 / 14, baseHeight: 0.15 },
]

/** Retângulo, em px do canvas, que o elemento de arte ocupa (o mesmo usado ao desenhar). Pode passar das bordas: a volta é contínua */
export function artworkElementBox(
  def: ArtworkElementDef,
  config: ArtworkElementConfig,
  canvasWidth = TEXTURE_WIDTH,
  canvasHeight = TEXTURE_HEIGHT,
) {
  const height = def.baseHeight * config.scale * PX_PER_UNIT
  const width = height * def.aspect
  const center = surfaceToCanvas(config.x, config.y, canvasWidth, canvasHeight)
  return { left: center.x - width / 2, top: center.y - height / 2, width, height }
}

export const DEFAULT_ARTWORK: ArtworkConfig = {
  m: {
    visible: true,
    color: '#aec90b',
    scale: 0.91,
    x: 0,
    y: 0.61,
    rotation: 0,
    effect: { type: 'none', color: '#ffffff', intensity: 0.7 },
  },
  wordmark: { visible: true, color: '#ffffff', scale: 1, x: 0, y: -0.46, rotation: 0 },
  energy: { visible: true, color: '#ffffff', scale: 1.03, x: 0, y: -0.75, rotation: 0 },
}

type LoadedImages = Partial<Record<ArtworkElementId, HTMLImageElement>>

export type LoadedArtwork = {
  images: LoadedImages
  /** camada do efeito interno do M, com as mesmas proporções do M */
  mEffect: HTMLCanvasElement | null
  /** arte do pattern já colorida; null = sem pattern */
  pattern: LoadedPattern | null
}

// Guarda só a última cor de cada elemento (o seletor de cor dispara muitos eventos)
const imageCache = new Map<ArtworkElementId, { color: string; promise: Promise<HTMLImageElement> }>()

function loadElementImage(def: ArtworkElementDef, color: string) {
  const cached = imageCache.get(def.id)
  if (cached?.color === color) return cached.promise

  const promise = svgToImage(def.svg.replaceAll(`fill="${def.sourceFill}"`, `fill="${color}"`))
  imageCache.set(def.id, { color, promise })
  return promise
}

/*
 * Efeito interno do M.
 * Máscara: o MESMO monster-m.svg, com o contorno transparente e o interior opaco (só a silhueta colorida).
 * Faixa "esquerda" = máscara − máscara deslocada para a direita: sobra apenas o que está colado na
 * borda esquerda de cada garra, seguindo o formato irregular. Vários deslocamentos com alpha acumulado
 * formam o degradê. Tudo sai da máscara, então nada vaza para fora do interior do M nem cobre o contorno.
 */
const EFFECT_HEIGHT = 1536
const EFFECT_STEPS = 10
const EFFECT_MAX_WIDTH = 0.075 // largura máxima da faixa, como fração da largura do M

let maskPromise: Promise<HTMLCanvasElement> | null = null
let bandCache: { key: string; canvas: HTMLCanvasElement } | null = null
let effectCache: { key: string; canvas: HTMLCanvasElement } | null = null

function loadMask(def: ArtworkElementDef) {
  maskPromise ??= svgToImage(
    def.svg
      .replaceAll(`fill="${def.outlineFill}"`, 'fill="none"')
      .replaceAll(`fill="${def.sourceFill}"`, 'fill="#000000"'),
  ).then((image) => {
    const canvas = createCanvas(Math.round(EFFECT_HEIGHT * def.aspect), EFFECT_HEIGHT)
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  })
  return maskPromise
}

// Só o formato (alpha) da faixa; a cor entra depois, então trocar a cor não refaz esta etapa
function getBandShape(mask: HTMLCanvasElement, type: 'left' | 'right', intensity: number) {
  const key = `${type}|${intensity}`
  if (bandCache?.key === key) return bandCache.canvas

  const shape = createCanvas(mask.width, mask.height)
  const step = createCanvas(mask.width, mask.height)
  const shapeCtx = shape.getContext('2d')
  const stepCtx = step.getContext('2d')
  if (!shapeCtx || !stepCtx) return shape

  const direction = type === 'left' ? 1 : -1
  const maxOffset = mask.width * EFFECT_MAX_WIDTH * (0.5 + 0.5 * intensity)
  // alpha por passada para que o pixel colado na borda (coberto por todas) chegue a "intensity"
  const stepAlpha = 1 - Math.pow(1 - Math.min(intensity, 0.98), 1 / EFFECT_STEPS)

  shapeCtx.globalAlpha = stepAlpha
  for (let i = 1; i <= EFFECT_STEPS; i++) {
    stepCtx.globalCompositeOperation = 'source-over'
    stepCtx.clearRect(0, 0, step.width, step.height)
    stepCtx.drawImage(mask, 0, 0)
    stepCtx.globalCompositeOperation = 'destination-out'
    stepCtx.drawImage(mask, (direction * maxOffset * i) / EFFECT_STEPS, 0)
    shapeCtx.drawImage(step, 0, 0)
  }

  bandCache = { key, canvas: shape }
  return shape
}

async function buildMEffect(def: ArtworkElementDef, effect: InnerEffect) {
  if (effect.type === 'none' || effect.intensity <= 0) return null

  const key = `${effect.type}|${effect.intensity}|${effect.color}`
  if (effectCache?.key === key) return effectCache.canvas

  const mask = await loadMask(def)
  const shape = getBandShape(mask, effect.type, effect.intensity)
  const canvas = createCanvas(shape.width, shape.height)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = effect.color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(shape, 0, 0)
  }

  effectCache = { key, canvas }
  return canvas
}

export async function loadArtwork(artwork: ArtworkConfig, patternConfig: PatternConfig): Promise<LoadedArtwork> {
  const images: LoadedImages = {}
  const [, mEffect, pattern] = await Promise.all([
    Promise.all(
      ARTWORK_ELEMENTS.map(async (def) => {
        if (artwork[def.id].visible) images[def.id] = await loadElementImage(def, artwork[def.id].color)
      }),
    ),
    artwork.m.visible ? buildMEffect(ARTWORK_ELEMENTS[0], artwork.m.effect) : null,
    loadPattern(patternConfig),
  ])
  return { images, mEffect, pattern }
}

export type ArtworkTarget = {
  /** composição ideal (a lata desenrolada, periódica em x): é onde tudo é desenhado */
  canvas: HTMLCanvasElement
  /** composição reprojetada para o UV do GLB: é o que a GPU lê (ver canUvLayout) */
  uvCanvas: HTMLCanvasElement
  uvLayout: BodyUvLayout
  texture: CanvasTexture
  /** a mesma reprojeção em PREVIEW_SCALE da resolução: enviada à GPU enquanto as mudanças são rápidas (sliders, arrastos) */
  preview: { uvCanvas: HTMLCanvasElement; texture: CanvasTexture }
}

/** Resolução da textura de prévia em relação à plena (0,5 = 1/4 dos pixels para reprojetar, subir e gerar mipmaps) */
export const PREVIEW_SCALE = 0.5

export type ArtworkQuality = 'full' | 'preview'

/** UV do corpo do GLB medido na geometria carregada (só leitura; o GLB e o UV não são alterados) */
export function measureCanBodyUv(geometry: BufferGeometry) {
  return measureBodyUv(geometry, { radius: CAN_RADIUS, wallTop: CHAMFER_PROFILE[0][0], yToV })
}

export function createArtworkTarget(
  bodyFill: BodyFill,
  maxAnisotropy: number,
  uvLayout: BodyUvLayout = IDENTITY_UV_LAYOUT,
): ArtworkTarget {
  const canvas = createCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT)
  const uvCanvas = createCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT)
  const previewCanvas = createCanvas(Math.round(TEXTURE_WIDTH * PREVIEW_SCALE), Math.round(TEXTURE_HEIGHT * PREVIEW_SCALE))

  const createTexture = (source: HTMLCanvasElement, gutter: number) => {
    const texture = new CanvasTexture(source)
    texture.flipY = false
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    const { repeat, offset } = uvTextureTransform(uvLayout, source.width, gutter)
    texture.repeat.x = repeat
    texture.offset.x = offset
    texture.anisotropy = maxAnisotropy
    return texture
  }
  const texture = createTexture(uvCanvas, SEAM_GUTTER)
  const preview = { uvCanvas: previewCanvas, texture: createTexture(previewCanvas, SEAM_GUTTER * PREVIEW_SCALE) }

  const target = { canvas, uvCanvas, uvLayout, texture, preview }
  paintArtwork(target, bodyFill, null, null, null, [], null, { images: {}, mEffect: null, pattern: null }, null, null)
  return target
}

/** Grade do pattern em modo "repeat" (o que realmente é desenhado, já ajustada para fechar a volta da lata) */
export function getPatternLattice(pattern: PatternConfig): RepeatLattice | null {
  if (pattern.id === 'none') return null
  const def = PATTERN_DEFS[pattern.id]
  return solveSeamlessLattice(def.aspect, TEXTURE_WIDTH, def.baseHeight * pattern.scale * PX_PER_UNIT, pattern.rotation)
}

/*
 * Composição (em `canvas`, depois reprojetada para o UV do GLB), em TRÊS FASES FIXAS:
 *
 *   1. FUNDO (paintBackdrop): base do corpo (cor sólida ou degradê) → fundo do ombro (só com cor própria) → pattern
 *      → CUSTOM ARTWORK
 *   2. IDENTIDADE (paintIdentity): M (+ efeito interno) → MONSTER → ENERGY → Flavor Name → Zero Sugar (só se sugar.type === 'zero')
 *      → Volume → Texto superior → rotulagem nutricional frontal (só se sugar.type === 'high-sugar')
 *   3. STICKERS (paintStickers): por cima de tudo isso; a ordem entre eles é a do array
 *
 * A identidade vem depois do fundo, então NADA do fundo (nem uma custom artwork 100% opaca) consegue ficar acima dela. Não há
 * configuração de ordem: a garantia é esta estrutura, não o gabarito. Só os stickers (decoração escolhida pelo usuário, com
 * posição própria) ficam acima da identidade.
 */
function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  bodyFill: BodyFill,
  /** fundo próprio do ombro; null = o preenchimento do corpo continua pelo ombro */
  shoulderColor: string | null,
  pattern: PatternConfig | null,
  loadedPattern: LoadedPattern | null,
  customArtwork: CustomArtwork | null,
) {
  const { canvas } = ctx
  paintBodyFill(ctx, bodyFill)

  // O ombro é a faixa acima da parede cilíndrica. É só o FUNDO: pattern, custom artwork, identidade e stickers vêm depois e ficam por cima
  if (shoulderColor) paintShoulderFill(ctx, shoulderColor, yToV(WALL_TOP_Y) * canvas.height)

  if (pattern && loadedPattern) {
    drawLayer(ctx, loadedPattern.source, pattern, {
      baseHeight: loadedPattern.baseHeight,
      pxPerUnit: PX_PER_UNIT,
      anchorX: canvas.width / 2 + pattern.x * PX_PER_UNIT,
      anchorY: yToV(pattern.y) * canvas.height,
    })
  }

  // Custom artwork: cobre cor/degradê/pattern onde for opaca; a identidade (fase seguinte) fica sempre acima
  if (customArtwork) paintCustomArtwork(ctx, customArtwork, PX_PER_UNIT)
}

function paintStickers(ctx: CanvasRenderingContext2D, stickers: readonly Sticker[]) {
  const { canvas } = ctx

  // Cada sticker é uma camada "single" independente; a ordem do array é a ordem de desenho
  for (const sticker of stickers) {
    if (!sticker.visible) continue
    drawLayer(
      ctx,
      sticker.source.canvas,
      { ...sticker, mode: 'single' },
      {
        baseHeight: stickerBaseHeight(sticker.source),
        pxPerUnit: PX_PER_UNIT,
        anchorX: canvas.width / 2 + sticker.x * PX_PER_UNIT,
        anchorY: yToV(sticker.y) * canvas.height,
      },
    )
  }
}

function paintIdentity(
  ctx: CanvasRenderingContext2D,
  artwork: ArtworkConfig | null,
  { images, mEffect }: LoadedArtwork,
  texts: TextsConfig | null,
  sugar: SugarConfig | null,
) {
  const { canvas } = ctx

  if (artwork) {
    for (const def of ARTWORK_ELEMENTS) {
      const config = artwork[def.id]
      const image = images[def.id]
      if (!config.visible || !image) continue

      const { left, top, width, height } = artworkElementBox(def, config, canvas.width, canvas.height)
      if (config.rotation === 0) {
        drawWrapped(canvas.width, left, left + width, (offset) => {
          ctx.drawImage(image, left + offset, top, width, height)
          if (def.id === 'm' && mEffect) ctx.drawImage(mEffect, left + offset, top, width, height)
        })
        continue
      }
      // girado em torno do centro; o alcance horizontal é o do retângulo girado (a volta continua sem emenda)
      const centerX = left + width / 2
      const centerY = top + height / 2
      const reach = Math.hypot(width, height) / 2
      drawWrapped(canvas.width, centerX - reach, centerX + reach, (offset) => {
        ctx.save()
        ctx.translate(centerX + offset, centerY)
        ctx.rotate((config.rotation * Math.PI) / 180)
        ctx.drawImage(image, -width / 2, -height / 2, width, height)
        if (def.id === 'm' && mEffect) ctx.drawImage(mEffect, -width / 2, -height / 2, width, height)
        ctx.restore()
      })
    }
  }

  // Sem `sugar` (pintura inicial) nada de açúcar é exibido; com ele, a visibilidade vem só de resolveSugarLabel
  const sugarOutput = resolveSugarLabel(sugar?.type ?? 'standard')

  if (texts) {
    for (const def of TEXT_ELEMENTS) {
      // ZERO SUGAR não tem visibilidade própria: as demais configurações (texto, faixa, cor, posição) são preservadas
      const config = def.id === 'zeroSugar' ? { ...texts[def.id], visible: sugarOutput.zeroSugar } : texts[def.id]
      const at = surfaceToCanvas(config.x, config.y, canvas.width, canvas.height)
      drawTextElement(ctx, def, config, {
        centerX: at.x,
        centerY: at.y,
        pxPerUnit: PX_PER_UNIT,
        canvasWidth: canvas.width,
        stretchX: at.stretchX,
      })
    }
  }

  if (sugar) {
    const at = surfaceToCanvas(sugar.highSugar.x, sugar.highSugar.y, canvas.width, canvas.height)
    drawFrontLabel(ctx, sugarOutput.frontNutrients, sugar.highSugar, {
      centerX: at.x,
      centerY: at.y,
      pxPerUnit: PX_PER_UNIT,
      canvasWidth: canvas.width,
      stretchX: at.stretchX,
    })
  }
}

/** Reprojeta a composição atual para o UV do GLB e marca a textura (plena ou prévia) para subir à GPU. Não repinta a composição */
export function presentArtwork({ canvas, uvCanvas, uvLayout, texture, preview }: ArtworkTarget, quality: ArtworkQuality = 'full') {
  if (quality === 'preview') {
    projectToUv(canvas, preview.uvCanvas, uvLayout, PREVIEW_SCALE)
    preview.texture.needsUpdate = true
  } else {
    projectToUv(canvas, uvCanvas, uvLayout)
    texture.needsUpdate = true
  }
}

export function paintArtwork(
  target: ArtworkTarget,
  bodyFill: BodyFill,
  shoulderColor: string | null,
  pattern: PatternConfig | null,
  customArtwork: CustomArtwork | null,
  stickers: readonly Sticker[],
  artwork: ArtworkConfig | null,
  loaded: LoadedArtwork,
  texts: TextsConfig | null,
  sugar: SugarConfig | null,
  quality: ArtworkQuality = 'full',
) {
  const { canvas } = target
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  paintBackdrop(ctx, bodyFill, shoulderColor, pattern, loaded.pattern, customArtwork)
  paintIdentity(ctx, artwork, loaded, texts, sugar)
  paintStickers(ctx, stickers)

  presentArtwork(target, quality)
}

export function applyArtworkTexture(material: MeshStandardMaterial, texture: CanvasTexture) {
  // trocar de textura (plena ↔ prévia) não muda o programa do shader: só a primeira vez, quando passa a existir um map, recompila
  const hadMap = material.map !== null
  material.map = texture
  if (!hadMap) material.needsUpdate = true
}
