import { buildGuideLayout, type GuideBox, type GuideLayout, type GuideRect, type GuideSource } from './canGuides'
import { drawWrapped } from './canWrap'
import { createCanvas } from './canvasUtils'

/*
 * Gabarito PNG do canvas de composição, para o usuário abrir no Figma/Photoshop/etc. como camada temporária. Só desenha:
 * onde ficam as regiões vem de canGuides (que reutiliza a renderização real). Fundo transparente, áreas semitransparentes,
 * rótulos com contorno claro para ler sobre qualquer arte. É orientação visual: nada aqui limita a arte do usuário.
 */

export const TEMPLATE_WATERMARK = 'GABARITO — NÃO INCLUIR NA EXPORTAÇÃO FINAL'

const COLORS = {
  safe: '#12a150',
  identity: '#e0245e',
  secondary: '#7c3aed',
  avoid: '#d97706',
  seam: '#2563eb',
  front: '#0891b2',
  ink: '#111827',
} as const

const RESERVED_IDENTITY = 'ÁREA RESERVADA — IDENTIDADE'
const RESERVED_TEXT = 'ÁREA RESERVADA — TEXTO DA LATA'

const FONT = 'Arial, Helvetica, sans-serif'
const LINE = 6

function rgba(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

type LabelOptions = { size: number; color: string; bold?: boolean; alpha?: number; rotate?: number }

// Texto centrado em (x, y) com contorno branco: legível sobre fundo claro, escuro ou sobre a própria arte
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, { size, color, bold = true, alpha = 1, rotate = 0 }: LabelOptions) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotate)
  ctx.globalAlpha = alpha
  ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.24
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

function hatch(ctx: CanvasRenderingContext2D, { x, y, width, height }: GuideRect, color: string) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.strokeStyle = rgba(color, 0.32)
  ctx.lineWidth = 4
  const step = 56
  for (let start = x - height; start < x + width; start += step) {
    ctx.beginPath()
    ctx.moveTo(start, y + height)
    ctx.lineTo(start + height, y)
    ctx.stroke()
  }
  ctx.restore()
}

function dashedRect(ctx: CanvasRenderingContext2D, { x, y, width, height }: GuideRect, color: string, alpha: number) {
  ctx.save()
  ctx.setLineDash([28, 18])
  ctx.lineWidth = LINE
  ctx.strokeStyle = rgba(color, alpha)
  ctx.strokeRect(x, y, width, height)
  ctx.restore()
}

/** Largura do texto com a fonte do gabarito, para o rótulo caber na área que ele marca */
function textWidth(ctx: CanvasRenderingContext2D, text: string, size: number, bold: boolean) {
  ctx.save()
  ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`
  const width = ctx.measureText(text).width
  ctx.restore()
  return width
}

/** Reduz o tamanho até o texto caber em `maxWidth` (nunca abaixo de MIN_LABEL) */
function fitSize(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, bold: boolean) {
  const width = textWidth(ctx, text, size, bold)
  return width > maxWidth ? Math.max(MIN_LABEL, (size * maxWidth) / width) : size
}

const MIN_LABEL = 22

// Áreas reservadas: a identidade Monster (e os textos da lata) é aplicada pelo Monster Lab SOBRE a arte do usuário, sempre.
// O rótulo diz isso e nomeia o elemento; a arte pode passar por baixo, mas o que estiver aqui ficará escondido.
function drawReserved(ctx: CanvasRenderingContext2D, layout: GuideLayout, box: GuideBox) {
  const color = box.kind === 'identity' ? COLORS.identity : COLORS.secondary
  const rect: GuideRect = box.ring ? { ...box, x: 0, width: layout.width } : box
  const kindLabel = box.kind === 'identity' ? RESERVED_IDENTITY : RESERVED_TEXT
  // um rótulo por cópia visível (o texto em anel aparece em duas metades da volta): cada um cabe em meia volta
  const room = (box.ring ? layout.width / 2 : rect.width) * 0.92
  const baseSize = Math.min(64, Math.max(34, rect.height * 0.42))
  const titleSize = fitSize(ctx, kindLabel, baseSize, room, true)
  const nameSize = fitSize(ctx, box.label, titleSize * 0.8, room, false)
  // com altura de sobra: título e nome em duas linhas; senão, título e nome numa só (`— nome`); baixa demais: vai logo abaixo
  const twoLines = rect.height >= (titleSize + nameSize) * 1.35
  const oneLine = `${kindLabel} · ${box.label}`
  const lineSize = fitSize(ctx, oneLine, titleSize, room, true)
  const outside = !twoLines && rect.height < lineSize * 1.5

  drawWrapped(layout.width, rect.x, rect.x + rect.width, (offset) => {
    ctx.fillStyle = rgba(color, 0.16)
    ctx.fillRect(rect.x + offset, rect.y, rect.width, rect.height)
    dashedRect(ctx, { ...rect, x: rect.x + offset }, color, 0.95)
    const centers = box.ring ? [layout.width / 4, (layout.width * 3) / 4] : [rect.x + offset + rect.width / 2]
    const middle = rect.y + rect.height / 2
    for (const cx of centers) {
      if (twoLines) {
        label(ctx, kindLabel, cx, middle - nameSize * 0.6, { size: titleSize, color })
        label(ctx, box.label, cx, middle + titleSize * 0.55, { size: nameSize, color, bold: false })
      } else {
        label(ctx, oneLine, cx, outside ? rect.y + rect.height + lineSize * 0.9 : middle, { size: lineSize, color })
      }
    }
  })
}

/** Desenha o gabarito; o canvas devolvido tem a resolução do layout e fundo transparente */
export function renderArtworkTemplate(layout: GuideLayout): HTMLCanvasElement {
  const { width, height, frontX, seamCaution, safe, avoidTop, avoidBottom } = layout
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // ÁREA SEGURA: só contorno e rótulos, sem preenchimento (o resto do PNG fica transparente)
  dashedRect(ctx, { x: safe.x + LINE / 2, y: safe.y, width: safe.width - LINE, height: safe.height }, COLORS.safe, 0.9)
  for (const cx of [width / 4, (width * 3) / 4]) {
    label(ctx, 'ÁREA SEGURA', cx, safe.y + 240, { size: 120, color: COLORS.safe })
    label(ctx, 'sua arte pode preencher todo o gabarito', cx, safe.y + 330, { size: 44, color: COLORS.safe, bold: false })
    label(ctx, 'a identidade da lata é aplicada por cima (áreas reservadas)', cx, safe.y + 386, { size: 36, color: COLORS.identity, bold: false })
    label(ctx, TEMPLATE_WATERMARK, cx, safe.y + 92, { size: 34, color: COLORS.ink, bold: false, alpha: 0.6 })
    label(ctx, `${width} × ${height} px`, cx, safe.y + 142, { size: 34, color: COLORS.ink, bold: false, alpha: 0.6 })
  }

  // EVITE CONTEÚDO IMPORTANTE: ombro superior e transição inferior
  for (const zone of [avoidTop, avoidBottom]) {
    ctx.fillStyle = rgba(COLORS.avoid, 0.1)
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height)
    hatch(ctx, zone, COLORS.avoid)
  }
  for (const cx of [width / 4, (width * 3) / 4]) {
    label(ctx, 'EVITE CONTEÚDO IMPORTANTE', cx, 46, { size: 54, color: COLORS.avoid })
    label(ctx, 'ombro superior: a arte se deforma mais aqui', cx, 100, { size: 36, color: COLORS.avoid, bold: false })
  }
  const bottomY = avoidBottom.y + avoidBottom.height / 2
  label(ctx, 'EVITE CONTEÚDO IMPORTANTE', width / 4, bottomY, { size: 36, color: COLORS.avoid })
  label(ctx, 'EVITE CONTEÚDO IMPORTANTE', (width * 7) / 8 - seamCaution / 2, bottomY, { size: 36, color: COLORS.avoid })

  // EMENDA: as bordas esquerda e direita são a mesma linha (atrás da lata). Elementos podem atravessá-la (o wrap é
  // contínuo); só textos e elementos críticos ficam mais seguros longe dela.
  const seamBands = [
    { x: 0, center: seamCaution / 2, edge: LINE },
    { x: width - seamCaution, center: width - seamCaution / 2, edge: width - LINE },
  ]
  for (const band of seamBands) {
    ctx.fillStyle = rgba(COLORS.seam, 0.08)
    ctx.fillRect(band.x, 0, seamCaution, height)
    ctx.fillStyle = rgba(COLORS.seam, 0.95)
    ctx.fillRect(band.edge - LINE, 0, LINE * 2, height)
    const middle = safe.y + safe.height / 2
    label(ctx, 'EMENDA DA LATA / SEAM', band.center - 56, middle, { size: 56, color: COLORS.seam, rotate: -Math.PI / 2 })
    label(ctx, 'as bordas esquerda e direita se encontram (atrás da lata)', band.center, middle, { size: 36, color: COLORS.seam, bold: false, rotate: -Math.PI / 2 })
    label(ctx, 'pode atravessar; prefira textos críticos longe daqui', band.center + 50, middle, { size: 36, color: COLORS.seam, bold: false, rotate: -Math.PI / 2 })
  }
  ctx.save()
  ctx.setLineDash([20, 20])
  ctx.lineWidth = 3
  ctx.strokeStyle = rgba(COLORS.seam, 0.7)
  for (const x of [seamCaution, width - seamCaution]) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  ctx.restore()

  // CENTRO FRONTAL: linha guia vertical, sob as caixas e seus rótulos
  ctx.fillStyle = rgba(COLORS.front, 0.95)
  ctx.fillRect(frontX - LINE, 0, LINE * 2, height)

  // ÁREAS RESERVADAS (identidade e textos secundários)
  for (const box of layout.reserved) drawReserved(ctx, layout, box)

  // rótulo do CENTRO FRONTAL (a linha em si foi desenhada antes das caixas, para não riscar os rótulos delas)
  label(ctx, 'CENTRO FRONTAL', frontX, 46, { size: 60, color: COLORS.front })
  label(ctx, 'o que fica no meio com a lata de frente', frontX, 100, { size: 34, color: COLORS.front, bold: false })

  return canvas
}

/** Gera o gabarito PNG (resolução do canvas de composição, fundo transparente) para as configurações atuais */
export async function createArtworkTemplate(source: GuideSource) {
  const layout = await buildGuideLayout(source)
  const canvas = renderArtworkTemplate(layout)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Não foi possível gerar o gabarito.'))), 'image/png')
  })
  return { blob, width: layout.width, height: layout.height, filename: `monster-can-gabarito-${layout.width}x${layout.height}.png` }
}

/** Gera e baixa o gabarito (sem backend) */
export async function downloadArtworkTemplate(source: GuideSource) {
  const { blob, filename } = await createArtworkTemplate(source)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return filename
}
