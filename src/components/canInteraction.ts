import {
  ARTWORK_ELEMENTS,
  ARTWORK_LIMITS,
  PX_PER_UNIT,
  TEXTURE_HEIGHT,
  TEXTURE_WIDTH,
  artworkElementBox,
  surfaceToCanvas,
  vToY,
  yToV,
  type ArtworkConfig,
  type ArtworkElementId,
} from './canArtwork'
import { CUSTOM_ARTWORK_LIMITS } from './canCustomArtwork'
import type { CustomArtwork } from './canCustomArtworkLayer'
import { resolveSugarLabel, type SugarConfig } from './canSugarLabel'
import { STICKER_LIMITS, stickerBaseHeight, type Sticker } from './canStickers'
import {
  TEXT_BACKGROUND_LIMITS,
  TEXT_ELEMENTS,
  TEXT_POSITION_LIMITS,
  drawTextElement,
  type TextElementId,
  type TextsConfig,
} from './canText'
import { TEXT_LIMITS } from './canTypography'
import { createCanvas } from './canvasUtils'

/*
 * MANIPULAÇÃO DIRETA: o que existe de puro (sem three, sem React) para selecionar e editar, sobre a lata, os elementos que já
 * têm x/y/scale/rotation nos estados do App. Aqui NÃO há um segundo sistema de posicionamento: os bounds vêm das mesmas funções
 * que desenham (artworkElementBox, drawTextElement, stickerBaseHeight, a geometria da custom artwork), e a edição devolve
 * PATCHES para os mesmos estados que os controles DEV alteram.
 *
 * Coordenadas: tudo em px do canvas de composição (a lata desenrolada, TEXTURE_WIDTH × TEXTURE_HEIGHT). Em x o canvas é
 * periódico (as bordas são a mesma linha, atrás da lata): as distâncias horizontais são sempre a menor volta (wrapDelta).
 */

export type Point = { x: number; y: number }

export type ElementKind = 'artwork' | 'text' | 'sticker' | 'customArtwork'

/** Elementos de texto editáveis (o Volume e o texto superior ficam de fora por ora) */
const EDITABLE_TEXTS: readonly TextElementId[] = ['flavor', 'zeroSugar']

/**
 * Ordem de desenho dos grupos (ver canArtwork.paintArtwork): fundo (custom artwork) < identidade < stickers. Dentro de
 * cada grupo, a ordem é a do array que quem desenha percorre. Hit-testing começa pelo maior zOrder.
 */
const Z_BACKDROP = 0
const Z_IDENTITY = 1000
const Z_STICKERS = 2000

export const CUSTOM_ARTWORK_ID = 'customArtwork'
const STICKER_PREFIX = 'sticker:'
export const stickerElementId = (stickerId: string) => `${STICKER_PREFIX}${stickerId}`
export const stickerIdOf = (elementId: string | null) =>
  elementId?.startsWith(STICKER_PREFIX) ? elementId.slice(STICKER_PREFIX.length) : null

export type InteractiveElement = {
  /** 'm' | 'wordmark' | 'energy' | 'flavor' | 'zeroSugar' | 'sticker:<id>' | 'customArtwork' */
  id: string
  kind: ElementKind
  label: string
  /** 'surface': x/y do estado são a posição na superfície; 'offset': deslocamentos a partir do gabarito (custom artwork) */
  space: 'surface' | 'offset'
  /** valores atuais do estado (os mesmos dos controles DEV) */
  x: number
  y: number
  /** escala do estado: scale (arte, sticker, custom artwork) ou fontSize (texto) */
  scale: number
  /** graus, sentido horário */
  rotation: number
  /** retângulo ocupado, sem rotação: centro e tamanho em px do canvas */
  center: Point
  width: number
  height: number
  visible: boolean
  zOrder: number
  /** camada de fundo (cobre a lata inteira): só arrasta quando já está selecionada; clicar seleciona */
  backdrop: boolean
  /** só texto: valores que a escala também altera (faixa do Zero Sugar, largura máxima do auto-fit) */
  text?: {
    maxWidth: number
    autoFit: boolean
    background?: { width: number; height: number; borderRadius: number }
  }
}

export type EditableState = {
  artwork: ArtworkConfig
  texts: TextsConfig
  sugar: SugarConfig
  stickers: readonly Sticker[]
  customArtwork: CustomArtwork | null
}

let scratch: CanvasRenderingContext2D | null | undefined

/**
 * Bounds de todos os elementos editáveis, na ordem de desenho (o último é o visualmente superior). Requer as fontes dos
 * textos carregadas (a medida do texto depende delas). Elementos ocultos ficam na lista com `visible: false`.
 */
export function collectInteractiveElements({ artwork, texts, sugar, stickers, customArtwork }: EditableState): InteractiveElement[] {
  const width = TEXTURE_WIDTH
  const height = TEXTURE_HEIGHT
  const elements: InteractiveElement[] = []

  if (customArtwork) {
    const { canvas } = customArtwork.source
    const circumference = width / PX_PER_UNIT
    const h = ((circumference * canvas.height) / canvas.width) * customArtwork.scale * PX_PER_UNIT
    elements.push({
      id: CUSTOM_ARTWORK_ID,
      kind: 'customArtwork',
      label: 'Custom Artwork',
      space: 'offset',
      x: customArtwork.x,
      y: customArtwork.y,
      scale: customArtwork.scale,
      rotation: customArtwork.rotation,
      center: { x: width / 2 + customArtwork.x * PX_PER_UNIT, y: height / 2 - customArtwork.y * PX_PER_UNIT },
      width: (h * canvas.width) / canvas.height,
      height: h,
      visible: customArtwork.visible,
      zOrder: Z_BACKDROP,
      backdrop: true,
    })
  }

  let identityOrder = Z_IDENTITY
  for (const def of ARTWORK_ELEMENTS) {
    const config = artwork[def.id]
    const box = artworkElementBox(def, config, width, height)
    elements.push({
      id: def.id,
      kind: 'artwork',
      label: def.label,
      space: 'surface',
      x: config.x,
      y: config.y,
      scale: config.scale,
      rotation: config.rotation,
      center: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      width: box.width,
      height: box.height,
      visible: config.visible,
      zOrder: identityOrder++,
      backdrop: false,
    })
  }

  const sugarOutput = resolveSugarLabel(sugar.type)
  scratch ??= createCanvas(1, 1).getContext('2d')
  for (const def of TEXT_ELEMENTS) {
    const order = identityOrder++
    if (!EDITABLE_TEXTS.includes(def.id) || !scratch) continue
    const config = def.id === 'zeroSugar' ? { ...texts[def.id], visible: sugarOutput.zeroSugar } : texts[def.id]
    const at = surfaceToCanvas(config.x, config.y, width, height)
    // rotação 0: a caixa devolvida é então a do retângulo sem girar (o centro não muda com a rotação)
    const fit = drawTextElement(scratch, def, { ...config, style: { ...config.style, rotation: 0 } }, {
      centerX: at.x,
      centerY: at.y,
      pxPerUnit: PX_PER_UNIT,
      canvasWidth: width,
      stretchX: at.stretchX,
    })
    if (!fit) continue
    const background = def.background && config.background?.visible ? config.background : undefined
    elements.push({
      id: def.id,
      kind: 'text',
      label: def.label,
      space: 'surface',
      x: config.x,
      y: config.y,
      scale: config.style.fontSize,
      rotation: config.style.rotation,
      center: { x: fit.box.centerX, y: fit.box.centerY },
      width: fit.box.width,
      height: fit.box.height,
      visible: config.visible,
      zOrder: order,
      backdrop: false,
      text: {
        maxWidth: config.style.maxWidth,
        autoFit: config.style.autoFit,
        background: background && {
          width: background.width,
          height: background.height,
          borderRadius: background.borderRadius,
        },
      },
    })
  }

  stickers.forEach((sticker, index) => {
    const h = stickerBaseHeight(sticker.source) * sticker.scale * PX_PER_UNIT
    elements.push({
      id: stickerElementId(sticker.id),
      kind: 'sticker',
      label: `Sticker ${index + 1}`,
      space: 'surface',
      x: sticker.x,
      y: sticker.y,
      scale: sticker.scale,
      rotation: sticker.rotation,
      center: { x: width / 2 + sticker.x * PX_PER_UNIT, y: yToV(sticker.y) * height },
      width: (h * sticker.source.canvas.width) / sticker.source.canvas.height,
      height: h,
      visible: sticker.visible,
      zOrder: Z_STICKERS + index,
      backdrop: false,
    })
  })

  return elements.sort((a, b) => a.zOrder - b.zOrder)
}

// --- Geometria -----------------------------------------------------------------------------------------------------

/** Diferença horizontal pela menor volta: o canvas é periódico em x (x = 0 e x = largura são a mesma linha) */
export const wrapDelta = (delta: number, canvasWidth = TEXTURE_WIDTH) => delta - canvasWidth * Math.round(delta / canvasWidth)

const rotate = ({ x, y }: Point, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** Cantos do retângulo (girado) em px do canvas: cima-esq, cima-dir, baixo-dir, baixo-esq. x não é enrolado */
export function elementCorners(element: InteractiveElement): [Point, Point, Point, Point] {
  const { center, width, height, rotation } = element
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const local = rotate({ x: (sx * width) / 2, y: (sy * height) / 2 }, rotation)
    return { x: center.x + local.x, y: center.y + local.y }
  }) as [Point, Point, Point, Point]
}

/** Ponto do canvas no sistema do elemento (centrado, sem rotação), pela menor volta em x */
export function toElementSpace(element: InteractiveElement, point: Point): Point {
  return rotate({ x: wrapDelta(point.x - element.center.x), y: point.y - element.center.y }, -element.rotation)
}

export function containsPoint(element: InteractiveElement, point: Point, padding = 0) {
  const local = toElementSpace(element, point)
  return Math.abs(local.x) <= element.width / 2 + padding && Math.abs(local.y) <= element.height / 2 + padding
}

/** O elemento visível que está por cima no ponto (respeita a ordem das camadas), ou null. `elements` na ordem de desenho */
export function hitTest(elements: readonly InteractiveElement[], point: Point, padding = 0): InteractiveElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]
    if (element.visible && containsPoint(element, point, padding)) return element
  }
  return null
}

// --- Edição (devolve patches para os mesmos estados dos controles DEV) ------------------------------------------------

export type ElementPatch = {
  x?: number
  y?: number
  /** scale (arte, sticker, custom artwork) ou fontSize (texto) */
  scale?: number
  rotation?: number
  /** só texto: consequências da escala */
  maxWidth?: number
  background?: { width: number; height: number; borderRadius: number }
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value))

const halfCircumference = TEXTURE_WIDTH / 2 / PX_PER_UNIT

/** x em unidades do modelo dentro de (−meia volta, +meia volta]: passar da costura continua do outro lado, sem prender na borda */
export const wrapX = (x: number) => x - 2 * halfCircumference * Math.round(x / (2 * halfCircumference))

const limitsOf = (element: InteractiveElement) => {
  switch (element.kind) {
    case 'artwork':
      return ARTWORK_LIMITS
    case 'sticker':
      return STICKER_LIMITS
    case 'customArtwork':
      return CUSTOM_ARTWORK_LIMITS
    case 'text':
      return { ...TEXT_POSITION_LIMITS, scale: TEXT_LIMITS.fontSize, rotation: TEXT_LIMITS.rotation }
  }
}

/** Rotação no intervalo do controle DEV do próprio elemento (sticker 0…360, os demais −180…180) */
export function normalizeRotation(element: InteractiveElement, degrees: number) {
  const turn = ((degrees % 360) + 360) % 360
  return element.kind === 'sticker' ? turn : turn > 180 ? turn - 360 : turn
}

/** Move o elemento: `dx`/`dy` em px do canvas desde o início do arraste (dx já pela menor volta) */
export function movePatch(element: InteractiveElement, dx: number, dy: number): ElementPatch {
  const limits = limitsOf(element)
  const x = wrapX(element.x + dx / PX_PER_UNIT)
  if (element.space === 'offset') return { x, y: clamp(element.y - dy / PX_PER_UNIT, limits.y) }
  return { x, y: clamp(vToY((yToV(element.y) * TEXTURE_HEIGHT + dy) / TEXTURE_HEIGHT), limits.y) }
}

/** Escala o elemento por `factor` (relativo ao início do arraste), respeitando os limites dos controles DEV */
export function scalePatch(element: InteractiveElement, factor: number): ElementPatch {
  const limits = limitsOf(element)
  const scale = clamp(element.scale * factor, limits.scale)
  if (element.kind !== 'text' || !element.text) return { scale }

  // texto: o tamanho da fonte é a escala. O auto-fit limitaria o tamanho renderizado à largura máxima, então ela cresce junto
  // (se o auto-fit estiver ligado); a faixa (Zero Sugar) acompanha, para o conjunto escalar como um só
  const applied = scale / element.scale
  const patch: ElementPatch = { scale }
  if (element.text.autoFit && applied > 1) patch.maxWidth = clamp(element.text.maxWidth * applied, TEXT_LIMITS.maxWidth)
  const background = element.text.background
  if (background) {
    patch.background = {
      width: clamp(background.width * applied, TEXT_BACKGROUND_LIMITS.width),
      height: clamp(background.height * applied, TEXT_BACKGROUND_LIMITS.height),
      borderRadius: background.borderRadius * applied,
    }
  }
  return patch
}

export function rotationPatch(element: InteractiveElement, degrees: number): ElementPatch {
  return { rotation: normalizeRotation(element, degrees) }
}

/** Ângulo, em graus, de `point` em torno do centro do elemento no canvas (0° = para a direita, sentido horário na tela) */
export function angleAround(element: InteractiveElement, point: Point) {
  return (Math.atan2(point.y - element.center.y, wrapDelta(point.x - element.center.x)) * 180) / Math.PI
}

export const distanceFromCenter = (element: InteractiveElement, point: Point) =>
  Math.hypot(wrapDelta(point.x - element.center.x), point.y - element.center.y)

// --- Aplicação nos estados do App ------------------------------------------------------------------------------------

export function patchArtwork(artwork: ArtworkConfig, id: ArtworkElementId, patch: ElementPatch): ArtworkConfig {
  const { x, y, scale, rotation } = patch
  return { ...artwork, [id]: { ...artwork[id], ...pick({ x, y, scale, rotation }) } }
}

export function patchTexts(texts: TextsConfig, id: TextElementId, patch: ElementPatch): TextsConfig {
  const current = texts[id]
  const style = {
    ...current.style,
    ...pick({ fontSize: patch.scale, rotation: patch.rotation, maxWidth: patch.maxWidth }),
  }
  const background = current.background && patch.background ? { ...current.background, ...patch.background } : current.background
  return { ...texts, [id]: { ...current, ...pick({ x: patch.x, y: patch.y }), style, ...(background && { background }) } }
}

export function patchStickers(stickers: readonly Sticker[], stickerId: string, patch: ElementPatch): Sticker[] {
  const { x, y, scale, rotation } = patch
  return stickers.map((sticker) => (sticker.id === stickerId ? { ...sticker, ...pick({ x, y, scale, rotation }) } : sticker))
}

export function patchCustomArtwork(customArtwork: CustomArtwork, patch: ElementPatch): CustomArtwork {
  const { x, y, scale, rotation } = patch
  return { ...customArtwork, ...pick({ x, y, scale, rotation }) }
}

// só as chaves definidas: um patch parcial nunca apaga o que não menciona
function pick<T extends Record<string, number | undefined>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as { [K in keyof T]?: number }
}
