/*
 * Motor tipográfico reutilizável dos textos da lata, desenhado direto no Canvas 2D principal (sem texturas por texto).
 * Tudo aqui é independente de UI: cada propriedade (x, y, rotation, fontSize, ...) pode ser manipulada por sliders DEV
 * hoje e por drag/touch direto sobre a lata no futuro.
 */

import { drawWrapped } from './canWrap'

// --- Fontes ------------------------------------------------------------------------------------------------------
// O projeto ainda NÃO embarca arquivos de fonte: só há fontes do sistema. Novas fontes (web ou locais) entram aqui, e o
// carregamento (`loadTextStyleFont`) já é aguardado antes de qualquer desenho, então nunca desenha com fallback.

/** Pesos com face REAL na fonte. O Bold nunca é simulado: se a fonte não o tem, o peso resolvido cai para o mais próximo */
export type FontWeight = 400 | 700

export const FONT_WEIGHT_LABELS: Record<FontWeight, string> = { 400: 'Regular', 700: 'Bold' }

export type FontId = 'impact' | 'arial-narrow' | 'arial' | 'arial-black'

export type FontDef = {
  id: FontId
  label: string
  /** pilha CSS usada no canvas (a primeira é a fonte; o resto é fallback) */
  family: string
  /** nome usado para detectar se a fonte está instalada */
  probe: string
  /** pesos com face real */
  weights: readonly FontWeight[]
}

export const FONT_CATALOG: readonly FontDef[] = [
  { id: 'impact', label: 'Impact', family: "Impact, Haettenschweiler, 'Arial Narrow', 'Arial Black', sans-serif", probe: 'Impact', weights: [400] },
  { id: 'arial-narrow', label: 'Arial Narrow', family: "'Arial Narrow', Arial, Helvetica, sans-serif", probe: 'Arial Narrow', weights: [400, 700] },
  { id: 'arial', label: 'Arial', family: 'Arial, Helvetica, sans-serif', probe: 'Arial', weights: [400, 700] },
  { id: 'arial-black', label: 'Arial Black', family: "'Arial Black', Arial, Helvetica, sans-serif", probe: 'Arial Black', weights: [400] },
]

export function getFontDef(id: FontId) {
  return FONT_CATALOG.find((font) => font.id === id) ?? FONT_CATALOG[0]
}

/** Peso efetivamente desenhado: o preferido do usuário, ou o mais próximo com face real. O valor guardado nunca é alterado */
export function resolveFontWeight(id: FontId, wanted: FontWeight): FontWeight {
  const { weights } = getFontDef(id)
  if (weights.includes(wanted)) return wanted
  return weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), weights[0])
}

// Detecção de instalação por medida: se a fonte existe, a largura difere de todas as pilhas genéricas
const availability = new Map<FontId, boolean>()
let probeContext: CanvasRenderingContext2D | null | undefined

function isFontInstalled(font: FontDef) {
  const cached = availability.get(font.id)
  if (cached !== undefined) return cached

  probeContext ??= document.createElement('canvas').getContext('2d')
  const ctx = probeContext
  let installed = true
  if (ctx) {
    const sample = 'mmmmmmmmmmlli 0123 WMÇ'
    const width = (family: string) => {
      ctx.font = `72px ${family}`
      return ctx.measureText(sample).width
    }
    installed = ['monospace', 'sans-serif', 'serif'].some((generic) => width(`"${font.probe}", ${generic}`) !== width(generic))
  }
  availability.set(font.id, installed)
  return installed
}

/** Fontes do catálogo que realmente existem neste dispositivo (o seletor só oferece estas) */
export function getAvailableFonts(): readonly FontDef[] {
  const available = FONT_CATALOG.filter(isFontInstalled)
  return available.length > 0 ? available : FONT_CATALOG
}

const fontLoads = new Map<string, Promise<unknown>>()

/** Garante a fonte carregada antes de medir/desenhar. Cada combinação família+peso é carregada uma única vez */
export function loadTextStyleFont(style: Pick<TextStyle, 'fontFamily' | 'fontWeight'>) {
  const weight = resolveFontWeight(style.fontFamily, style.fontWeight)
  const key = `${style.fontFamily}|${weight}`
  let load = fontLoads.get(key)
  if (!load) {
    load = document.fonts.load(`${weight} 16px ${getFontDef(style.fontFamily).family}`).catch(() => [])
    fontLoads.set(key, load)
  }
  return load
}

// --- Modelo ------------------------------------------------------------------------------------------------------

export type TextAlign = 'left' | 'center' | 'right'

export type TextStroke = {
  enabled: boolean
  color: string
  /** espessura VISÍVEL do contorno para fora do glifo, em em (relativa ao tamanho da fonte) */
  width: number
}

export type TextStyle = {
  fontFamily: FontId
  /** peso preferido; o desenhado é `resolveFontWeight` */
  fontWeight: FontWeight
  /** tamanho DESEJADO, em unidades do modelo. O auto-fit calcula um tamanho renderizado sem alterar este valor */
  fontSize: number
  color: string
  /** em em (relativo ao tamanho da fonte); negativo aproxima, positivo afasta */
  letterSpacing: number
  /** o ponto X do elemento é a borda esquerda, o centro ou a borda direita do texto */
  textAlign: TextAlign
  /** aplicado só ao desenhar: o conteúdo digitado nunca é alterado */
  uppercase: boolean
  /** graus, sentido horário, em torno do centro do texto */
  rotation: number
  stroke: TextStroke
  /** largura máxima (texto + folgas), em unidades do modelo, usada pelo auto-fit */
  maxWidth: number
  autoFit: boolean
}

export type TextElement = {
  content: string
  visible: boolean
  /** deslocamento horizontal a partir do centro frontal, em unidades do modelo (ao longo da superfície) */
  x: number
  /** posição vertical do centro do texto, em unidades do modelo (y do GLB, positivo = para cima) */
  y: number
  style: TextStyle
}

export const DEFAULT_TEXT_STROKE: TextStroke = { enabled: false, color: '#1d1d1b', width: 0.05 }

export const TEXT_LIMITS = {
  /** tamanho desejado; também é o piso do tamanho renderizado pelo auto-fit (abaixo disso ficaria ilegível) */
  fontSize: { min: 0.05, max: 0.6 },
  letterSpacing: { min: -0.1, max: 0.5 },
  strokeWidth: { min: 0.01, max: 0.1 },
  maxWidth: { min: 0.3, max: 2.6 },
  rotation: { min: -180, max: 180 },
} as const

// --- Layout com espaçamento entre letras -------------------------------------------------------------------------

type TextLayout = {
  text: string
  /** posição x de cada caractere (a partir do início do texto); null = sem espaçamento, desenha a string inteira */
  characters: { char: string; x: number }[] | null
  /** largura total, sem espaçamento depois do último caractere */
  width: number
}

// Não usa ctx.letterSpacing (suporte irregular e sem controle do alinhamento): cada caractere é posicionado por
// x = largura(prefixo até ele) − largura(ele) + i·espaçamento. Assim o kerning entre pares continua valendo e a largura
// medida já inclui o espaçamento. Requer ctx.font definido.
function layoutText(ctx: CanvasRenderingContext2D, text: string, size: number, letterSpacing: number): TextLayout {
  const spacing = letterSpacing * size
  const width = ctx.measureText(text).width
  if (spacing === 0) return { text, characters: null, width }

  const chars = Array.from(text)
  let prefix = ''
  const characters = chars.map((char, i) => {
    prefix += char
    return { char, x: ctx.measureText(prefix).width - ctx.measureText(char).width + i * spacing }
  })
  return { text, characters, width: Math.max(0, width + (chars.length - 1) * spacing) }
}

function drawLayout(ctx: CanvasRenderingContext2D, layout: TextLayout, x: number, y: number, mode: 'fill' | 'stroke') {
  const draw = (text: string, tx: number) => (mode === 'fill' ? ctx.fillText(text, tx, y) : ctx.strokeText(text, tx, y))
  if (!layout.characters) {
    draw(layout.text, x)
    return
  }
  for (const { char, x: cx } of layout.characters) {
    if (char.trim()) draw(char, x + cx)
  }
}

// --- Desenho -----------------------------------------------------------------------------------------------------

export type TextPlacement = {
  /** ponto X do elemento no canvas, em px (o alinhamento decide se é a borda ou o centro do texto) */
  centerX: number
  centerY: number
  pxPerUnit: number
  /** largura do canvas (= circunferência completa da lata), em px */
  canvasWidth: number
  /** compensa o estreitamento horizontal onde o raio da lata diminui (ombro): raio máx / raio local */
  stretchX: number
}

/** Estrutura própria de certos elementos (não faz parte do estilo tipográfico livre) */
export type TextStructure = {
  /** Faixa independente; medidas em unidades do modelo. */
  background?: { width: number; height: number; borderRadius: number; color: string }
  /** Centraliza pelos limites reais dos glifos, inclusive com espaçamento manual. */
  centerInk?: boolean
  /** repete o texto ao redor de toda a lata, distribuído por igual; `gap` = espaço mínimo entre repetições, em em */
  ring?: { gap: number }
}

const MAX_FIT_PASSES = 3

export type TextFit = {
  /** tamanho renderizado, em px do canvas */
  size: number
  /** true se coube na largura máxima (false só se o piso de tamanho foi atingido) */
  fits: boolean
  /** retângulo, em px do canvas, que o texto (e a faixa, se houver) ocupa, já com rotação e estreitamento; o anel ocupa a volta toda */
  box: { centerX: number; centerY: number; width: number; height: number }
}

/**
 * Desenha um texto. O tamanho renderizado é calculado a cada desenho a partir do tamanho DESEJADO (style.fontSize):
 * com auto-fit, reduz até caber em maxWidth considerando fonte, peso, espaçamento e contorno, sem passar do
 * piso TEXT_LIMITS.fontSize.min. Retorna o ajuste aplicado (útil para testes).
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  content: string,
  style: TextStyle,
  { centerX, centerY, pxPerUnit, canvasWidth, stretchX }: TextPlacement,
  structure: TextStructure = {},
): TextFit | null {
  const trimmed = content.trim()
  if (!trimmed && !structure.background) return null
  const text = style.uppercase ? trimmed.toLocaleUpperCase('pt-BR') : trimmed

  const weight = resolveFontWeight(style.fontFamily, style.fontWeight)
  const family = getFontDef(style.fontFamily).family
  const strokeEnabled = style.stroke.enabled && style.stroke.width > 0
  const { background, ring, centerInk } = structure

  ctx.save()
  if (centerInk) {
    ctx.resetTransform()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowColor = 'transparent'
    ctx.filter = 'none'
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'

  // Medidas em px "locais" (antes do stretchX). Tudo é proporcional ao tamanho da fonte, então o cálculo escala linearmente.
  const measure = (size: number) => {
    ctx.font = `${weight} ${size}px ${family}`
    const layout = layoutText(ctx, text, size, style.letterSpacing)
    const strokePad = strokeEnabled ? style.stroke.width * size : 0
    return { layout, strokePad, total: layout.width + 2 * strokePad }
  }

  // No anel o limite é a circunferência inteira (e sempre ajusta, para fechar a volta); nos demais, maxWidth se autoFit
  const limit = ring ? canvasWidth * 0.95 : style.maxWidth * pxPerUnit
  const shouldFit = Boolean(ring) || style.autoFit
  const minSize = TEXT_LIMITS.fontSize.min * pxPerUnit

  let size = style.fontSize * pxPerUnit
  let metrics = measure(size)
  for (let pass = 0; shouldFit && pass < MAX_FIT_PASSES && metrics.total * stretchX > limit * 1.001 && size > minSize; pass++) {
    size = Math.max(minSize, (size * limit) / (metrics.total * stretchX))
    metrics = measure(size)
  }
  const fits = !shouldFit || metrics.total * stretchX <= limit * 1.001

  const capHeight = ctx.measureText('H').actualBoundingBoxAscent
  // Medir os mesmos glifos, nas mesmas posições usadas por drawLayout, evita offsets
  // fixos e considera peso, kerning, espaçamento, ascendentes e descendentes.
  let inkLeft = Infinity, inkRight = -Infinity, inkTop = Infinity, inkBottom = -Infinity
  if (centerInk && text) {
    const runs = metrics.layout.characters ?? [{ char: text, x: 0 }]
    for (const { char, x } of runs) {
      if (!char.trim()) continue
      const bounds = ctx.measureText(char)
      inkLeft = Math.min(inkLeft, x - bounds.actualBoundingBoxLeft)
      inkRight = Math.max(inkRight, x + bounds.actualBoundingBoxRight)
      inkTop = Math.min(inkTop, -bounds.actualBoundingBoxAscent)
      inkBottom = Math.max(inkBottom, bounds.actualBoundingBoxDescent)
    }
  }
  const hasInk = Number.isFinite(inkLeft)
  const align = ring || centerInk ? 'center' : style.textAlign
  const boxLeft = align === 'center' ? -metrics.total / 2 : align === 'right' ? -metrics.total : 0
  const radians = (style.rotation * Math.PI) / 180

  const drawAt = (anchorX: number) => {
    ctx.save()
    // A caixa do texto é posicionada pelo alinhamento em relação ao ponto X; a rotação é em torno do CENTRO dessa caixa
    ctx.translate(anchorX + (boxLeft + metrics.total / 2) * stretchX, centerY)
    ctx.rotate(radians)
    ctx.scale(stretchX, 1)

    const left = -metrics.total / 2
    if (background) {
      const width = Math.max(0, background.width * pxPerUnit)
      const height = Math.max(0, background.height * pxPerUnit)
      const radius = Math.max(0, Math.min(background.borderRadius * pxPerUnit, width / 2, height / 2))
      const x = -width / 2, y = -height / 2
      ctx.fillStyle = background.color
      // Um único contorno fechado e um único fill. Não há retângulos adjacentes
      // nem borda interna; subpixels afetam apenas o perímetro externo.
      ctx.beginPath()
      ctx.moveTo(x + radius, y)
      ctx.lineTo(x + width - radius, y)
      ctx.arcTo(x + width, y, x + width, y + radius, radius)
      ctx.lineTo(x + width, y + height - radius)
      ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
      ctx.lineTo(x + radius, y + height)
      ctx.arcTo(x, y + height, x, y + height - radius, radius)
      ctx.lineTo(x, y + radius)
      ctx.arcTo(x, y, x + radius, y, radius)
      ctx.closePath()
      ctx.fill()
    }

    const textX = centerInk && hasInk ? -(inkLeft + inkRight) / 2 : left + metrics.strokePad
    const baseline = centerInk && hasInk ? -(inkTop + inkBottom) / 2 : capHeight / 2
    if (strokeEnabled) {
      // o traço é centrado no contorno: com o dobro da largura, a metade de fora tem a espessura pedida e o fill cobre o resto
      ctx.lineWidth = 2 * metrics.strokePad
      ctx.strokeStyle = style.stroke.color
      drawLayout(ctx, metrics.layout, textX, baseline, 'stroke')
    }
    ctx.fillStyle = style.color
    drawLayout(ctx, metrics.layout, textX, baseline, 'fill')
    ctx.restore()
  }

  // Retângulo ocupado (sem contar as cópias do wrap): a faixa e/ou a tinta do texto, girados em torno do centro da caixa
  const bounds = ctx.measureText(text)
  const inkHeight = bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent
  const boxWidth = Math.max(background ? background.width * pxPerUnit : 0, metrics.total) * stretchX
  const boxHeight = Math.max(background ? background.height * pxPerUnit : 0, inkHeight)
  const rotatedWidth = Math.abs(Math.cos(radians)) * boxWidth + Math.abs(Math.sin(radians)) * boxHeight
  const rotatedHeight = Math.abs(Math.sin(radians)) * boxWidth + Math.abs(Math.cos(radians)) * boxHeight
  const boxCenter = centerX + (boxLeft + metrics.total / 2) * stretchX
  const box = ring
    ? { centerX: canvasWidth / 2, centerY, width: canvasWidth, height: rotatedHeight }
    : { centerX: boxCenter, centerY, width: rotatedWidth, height: rotatedHeight }

  if (!ring) {
    // Cópias completas, somente quando a forma atravessa a borda periódica da textura (ver canWrap). Nunca dividir a
    // faixa em metades ou sobrepor no centro. A caixa do texto está centrada em boxCenter, qualquer que seja o alinhamento.
    const width = Math.max(background ? background.width * pxPerUnit : 0, metrics.total)
    const height = Math.max(background ? background.height * pxPerUnit : 0, size * 2)
    const reach = (Math.abs(Math.cos(radians)) * width * stretchX + Math.abs(Math.sin(radians)) * height) / 2
    drawWrapped(canvasWidth, boxCenter - reach, boxCenter + reach, (offset) => drawAt(centerX + offset))
  } else {
    // Repete o texto o máximo de vezes que couber e distribui por igual, para fechar a volta sem emenda
    const unit = (metrics.total + ring.gap * size) * stretchX
    const count = Math.max(1, Math.floor(canvasWidth / unit))
    const spacing = canvasWidth / count
    const half = (metrics.total * stretchX) / 2
    for (let i = 0; i < count; i++) {
      const base = centerX + i * spacing
      drawWrapped(canvasWidth, base - half, base + half, (offset) => drawAt(base + offset))
    }
  }

  ctx.restore()
  return { size, fits, box }
}
