/*
 * Rotulagem nutricional frontal (modelo horizontal brasileiro): lupa + "ALTO EM" sobre fundo branco, seguidos de um
 * bloco preto com o nutriente em caixa alta. É um selo regulatório: sempre preto e branco, nunca usa as cores da lata.
 *
 * O desenho não sabe nada de açúcar: recebe uma lista de nutrientes e empilha um bloco preto por nutriente, ao lado
 * de uma única lupa + "ALTO EM". Hoje só existe 'sugar'; novos nutrientes entram na tabela NUTRIENTS.
 */

import { drawWrapped } from './canWrap'

export type FrontLabelNutrient = 'sugar'

const NUTRIENTS: Record<FrontLabelNutrient, { lines: readonly string[] }> = {
  sugar: { lines: ['AÇÚCAR', 'ADICIONADO'] },
}

const HEADER = 'ALTO EM'
const FONT_FAMILY = "Arial, Helvetica, 'Liberation Sans', sans-serif"
const BLACK = '#000000'
const WHITE = '#ffffff'

// Posição/tamanho editáveis; as cores NÃO são configuráveis
export type FrontLabelPlacement = {
  /** multiplicador sobre a altura base */
  scale: number
  /** deslocamento horizontal a partir do centro frontal, em unidades do modelo (ao longo da superfície) */
  x: number
  /** posição vertical do centro, em unidades do modelo (y do GLB, positivo = para cima) */
  y: number
}

/** altura, em unidades do modelo, de um selo de um nutriente de duas linhas com scale = 1 */
export const FRONT_LABEL_BASE_HEIGHT = 0.17

// Medidas em "em" (tamanho da fonte). O selo de referência (2 linhas) tem altura ROW_EM(2) = 3.48 em
const LINE_HEIGHT = 1.12
const ROW_PADDING_Y = 0.62
const BLACK_PADDING_X = 0.8
const WHITE_PADDING_X = 0.7
const ICON_SIZE = 2.3
const ICON_GAP = 0.5
const BORDER = 0.16
const ROW_SEPARATOR = 0.12
const CORNER_RADIUS = 0.45
const REFERENCE_ROW_HEIGHT = 2 * LINE_HEIGHT + 2 * ROW_PADDING_Y

const rowHeightEm = (lines: number) => lines * LINE_HEIGHT + 2 * ROW_PADDING_Y

/** Retângulo, em px do canvas, ocupado pelo selo (sem contar as cópias do wrap) */
export type FrontLabelBox = { centerX: number; centerY: number; width: number; height: number }

export type FrontLabelPlacementPx = {
  /** centro do selo no canvas, em px */
  centerX: number
  centerY: number
  /** px por unidade do modelo */
  pxPerUnit: number
  /** largura do canvas (= circunferência completa da lata), em px */
  canvasWidth: number
  /** compensa o estreitamento horizontal onde o raio da lata diminui (ombro): raio máx / raio local */
  stretchX: number
}

// Lupa: aro + cabo em diagonal, no canto inferior direito
function drawMagnifier(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, size: number) {
  const ringRadius = size * 0.3
  const ringX = centerX - size * 0.1
  const ringY = centerY - size * 0.1
  const diagonal = Math.SQRT1_2

  ctx.save()
  ctx.strokeStyle = BLACK
  ctx.lineWidth = size * 0.12
  ctx.beginPath()
  ctx.arc(ringX, ringY, ringRadius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.lineWidth = size * 0.18
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(ringX + diagonal * (ringRadius + size * 0.05), ringY + diagonal * (ringRadius + size * 0.05))
  ctx.lineTo(centerX + size * 0.42, centerY + size * 0.42)
  ctx.stroke()
  ctx.restore()
}

export function drawFrontLabel(
  ctx: CanvasRenderingContext2D,
  nutrients: readonly FrontLabelNutrient[],
  placement: FrontLabelPlacement,
  { centerX, centerY, pxPerUnit, canvasWidth, stretchX }: FrontLabelPlacementPx,
): FrontLabelBox | null {
  if (nutrients.length === 0) return null

  const em = (FRONT_LABEL_BASE_HEIGHT * placement.scale * pxPerUnit) / REFERENCE_ROW_HEIGHT
  const rows = nutrients.map((id) => NUTRIENTS[id].lines)
  const rowHeights = rows.map((lines) => rowHeightEm(lines.length) * em)
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0)

  ctx.save()
  ctx.font = `700 ${em}px ${FONT_FAMILY}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  const capHeight = ctx.measureText('H').actualBoundingBoxAscent
  const headerWidth = ctx.measureText(HEADER).width
  const whiteWidth = (WHITE_PADDING_X * 2 + ICON_SIZE + ICON_GAP) * em + headerWidth
  const blackWidth =
    Math.max(...rows.flatMap((lines) => lines.map((line) => ctx.measureText(line).width))) + BLACK_PADDING_X * 2 * em
  const totalWidth = whiteWidth + blackWidth

  // A caixa é desenhada por inteiro em cada cópia que aparece no canvas (a volta é contínua; ver canWrap)
  const halfWidth = (totalWidth * stretchX) / 2
  drawWrapped(canvasWidth, centerX - halfWidth, centerX + halfWidth, (offset) => {
    ctx.save()
    ctx.translate(centerX + offset, centerY)
    ctx.scale(stretchX, 1)
    const left = -totalWidth / 2
    const top = -totalHeight / 2

    // fundo branco (bloco "ALTO EM") + um bloco preto por nutriente, recortados nos cantos arredondados do selo
    const border = BORDER * em
    const radius = CORNER_RADIUS * em
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(left, top, totalWidth, totalHeight, radius)
    ctx.clip()
    ctx.fillStyle = WHITE
    ctx.fillRect(left, top, totalWidth, totalHeight)
    ctx.fillStyle = BLACK
    let rowTop = top
    rowHeights.forEach((height) => {
      ctx.fillRect(left + whiteWidth, rowTop, blackWidth, height)
      rowTop += height
    })
    // separador branco entre blocos pretos empilhados
    ctx.fillStyle = WHITE
    rowTop = top
    rowHeights.slice(0, -1).forEach((height) => {
      rowTop += height
      ctx.fillRect(left + whiteWidth, rowTop - (ROW_SEPARATOR * em) / 2, blackWidth, ROW_SEPARATOR * em)
    })

    ctx.restore()

    // contorno preto (traço centrado na borda, desenhado para dentro, acompanhando o canto arredondado)
    ctx.strokeStyle = BLACK
    ctx.lineWidth = border
    ctx.beginPath()
    ctx.roundRect(left + border / 2, top + border / 2, totalWidth - border, totalHeight - border, Math.max(0, radius - border / 2))
    ctx.stroke()

    // lupa + "ALTO EM" centralizados na altura total
    drawMagnifier(ctx, left + (WHITE_PADDING_X + ICON_SIZE / 2) * em, 0, ICON_SIZE * em)
    ctx.fillStyle = BLACK
    ctx.fillText(HEADER, left + (WHITE_PADDING_X + ICON_SIZE + ICON_GAP) * em, capHeight / 2)

    // nutrientes: linhas centralizadas no bloco preto
    ctx.fillStyle = WHITE
    ctx.textAlign = 'center'
    rowTop = top
    rows.forEach((lines, r) => {
      lines.forEach((line, k) => {
        const lineCenter = rowTop + (ROW_PADDING_Y + LINE_HEIGHT * (k + 0.5)) * em
        ctx.fillText(line, left + whiteWidth + blackWidth / 2, lineCenter + capHeight / 2)
      })
      rowTop += rowHeights[r]
    })
    ctx.restore()
  })

  ctx.restore()
  return { centerX, centerY, width: totalWidth * stretchX, height: totalHeight }
}
