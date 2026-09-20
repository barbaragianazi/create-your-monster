import {
  ARTWORK_ELEMENTS,
  PX_PER_UNIT,
  TEXTURE_HEIGHT,
  TEXTURE_WIDTH,
  WALL_BOTTOM_Y,
  WALL_TOP_Y,
  artworkElementBox,
  surfaceToCanvas,
  yToV,
  type ArtworkConfig,
} from './canArtwork'
import { drawFrontLabel } from './canFrontLabel'
import { resolveSugarLabel, type SugarConfig } from './canSugarLabel'
import { drawTextElement, loadTextFonts, TEXT_ELEMENTS, type TextsConfig } from './canText'
import { createCanvas } from './canvasUtils'

/*
 * Layout de guias do canvas de composição: ONDE ficam as regiões que o gabarito de custom artwork indica. Não desenha nada
 * (quem desenha é canTemplate). Nada aqui tem coordenadas próprias: os retângulos reservados saem das mesmas configurações,
 * conversão (surfaceToCanvas) e rotinas de medida (artworkElementBox, drawText, drawFrontLabel) que renderizam a lata.
 * Se a composição mudar (posição, tamanho, fonte, resolução), o gabarito muda junto.
 */

/** Área em px do canvas de composição (x da esquerda, y de cima). Pode passar das bordas: a volta é contínua */
export type GuideRect = { x: number; y: number; width: number; height: number }

export type GuideBox = GuideRect & {
  id: string
  label: string
  /** identidade Monster (M, MONSTER, ENERGY, Flavor, rotulagem) ou texto secundário */
  kind: 'identity' | 'secondary'
  /** ocupa a volta inteira (texto em anel): só a altura importa */
  ring?: boolean
}

export type GuideLayout = {
  /** mesma resolução da CanvasTexture de composição */
  width: number
  height: number
  /** x do centro frontal (o que fica no meio quando a lata está de frente) */
  frontX: number
  /** x da emenda da volta: as bordas esquerda e direita do canvas são a mesma linha, atrás da lata */
  seamX: readonly [number, number]
  /** faixa, de cada lado da emenda, em que textos e elementos críticos ficam mais seguros longe */
  seamCaution: number
  /** parede cilíndrica entre o ombro superior e a transição inferior */
  safe: GuideRect
  avoidTop: GuideRect
  avoidBottom: GuideRect
  reserved: readonly GuideBox[]
}

// Orientação de design, não geometria: duas facetas do corpo (32 no GLB) de cada lado da emenda
const SEAM_CAUTION_FRACTION = 2 / 32

export type GuideSource = {
  artwork: ArtworkConfig
  texts: TextsConfig
  sugar: SugarConfig
}

const TEXT_LABELS: Record<string, { label: string; kind: GuideBox['kind'] }> = {
  flavor: { label: 'FLAVOR NAME', kind: 'identity' },
  zeroSugar: { label: 'ZERO SUGAR', kind: 'identity' },
  volume: { label: 'VOLUME', kind: 'secondary' },
  topText: { label: 'TEXTO SUPERIOR (repete ao redor)', kind: 'secondary' },
}

const boxToRect = (box: { centerX: number; centerY: number; width: number; height: number }): GuideRect => ({
  x: box.centerX - box.width / 2,
  y: box.centerY - box.height / 2,
  width: box.width,
  height: box.height,
})

/**
 * Calcula o layout de guias para as configurações atuais. Assíncrono só porque as fontes precisam estar carregadas para
 * medir os textos. Reserva os dois selos de açúcar (ZERO SUGAR e rotulagem frontal) independentemente do tipo escolhido,
 * já que o cliente pode alternar entre eles; elementos ocultos (visible = false) não são reservados.
 */
export async function buildGuideLayout({ artwork, texts, sugar }: GuideSource): Promise<GuideLayout> {
  const width = TEXTURE_WIDTH
  const height = TEXTURE_HEIGHT
  await loadTextFonts(texts)

  const reserved: GuideBox[] = []

  for (const def of ARTWORK_ELEMENTS) {
    const config = artwork[def.id]
    if (!config.visible) continue
    const { left, top, width: w, height: h } = artworkElementBox(def, config, width, height)
    // com rotação, a área reservada é a caixa que envolve o retângulo girado
    const radians = (config.rotation * Math.PI) / 180
    const boxW = Math.abs(Math.cos(radians)) * w + Math.abs(Math.sin(radians)) * h
    const boxH = Math.abs(Math.sin(radians)) * w + Math.abs(Math.cos(radians)) * h
    reserved.push({
      id: def.id,
      label: def.label.toUpperCase(),
      kind: 'identity',
      x: left + w / 2 - boxW / 2,
      y: top + h / 2 - boxH / 2,
      width: boxW,
      height: boxH,
    })
  }

  // Os textos são medidos pelo próprio motor tipográfico, num canvas mínimo (o que sai do canvas é descartado)
  const scratch = createCanvas(1, 1).getContext('2d')
  if (scratch) {
    for (const def of TEXT_ELEMENTS) {
      const config = texts[def.id]
      const at = surfaceToCanvas(config.x, config.y, width, height)
      const fit = drawTextElement(scratch, def, config, {
        centerX: at.x,
        centerY: at.y,
        pxPerUnit: PX_PER_UNIT,
        canvasWidth: width,
        stretchX: at.stretchX,
      })
      if (!fit) continue
      const { label, kind } = TEXT_LABELS[def.id] ?? { label: def.label.toUpperCase(), kind: 'secondary' }
      reserved.push({ id: def.id, label, kind, ring: Boolean(def.ring), ...boxToRect(fit.box) })
    }

    const at = surfaceToCanvas(sugar.highSugar.x, sugar.highSugar.y, width, height)
    const seal = drawFrontLabel(scratch, resolveSugarLabel('high-sugar').frontNutrients, sugar.highSugar, {
      centerX: at.x,
      centerY: at.y,
      pxPerUnit: PX_PER_UNIT,
      canvasWidth: width,
      stretchX: at.stretchX,
    })
    if (seal) {
      reserved.push({ id: 'frontLabel', label: 'ROTULAGEM (ALTO EM AÇÚCAR)', kind: 'identity', ...boxToRect(seal) })
    }
  }

  const safeTop = yToV(WALL_TOP_Y) * height
  const safeBottom = yToV(WALL_BOTTOM_Y) * height

  return {
    width,
    height,
    frontX: surfaceToCanvas(0, 0, width, height).x,
    seamX: [0, width],
    seamCaution: width * SEAM_CAUTION_FRACTION,
    safe: { x: 0, y: safeTop, width, height: safeBottom - safeTop },
    avoidTop: { x: 0, y: 0, width, height: safeTop },
    avoidBottom: { x: 0, y: safeBottom, width, height: height - safeBottom },
    reserved,
  }
}
