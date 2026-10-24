import { Color } from 'three'
import clawUrl from '../assets/branding/monster-m-clean.svg'

/*
 * Fundos do palco. Cada um tem um pintor em canvas 2D (coordenadas relativas ao tamanho), que serve a três usos: o fundo ao vivo dos
 * novos fundos, as miniaturas do seletor e a exportação da imagem com fundo. Assim o PNG exportado sai igual ao que está na tela.
 * (O fundo "Monster" ao vivo continua em DOM, por causa do parallax; o pintor dele só reproduz as camadas estáticas.)
 */

export type BackdropId = 'monster' | 'studio' | 'neon' | 'grid' | 'burst' | 'can' | 'custom'

export const BACKDROPS: { id: BackdropId; label: string }[] = [
  { id: 'monster', label: 'Monster' },
  { id: 'studio', label: 'Estúdio' },
  { id: 'neon', label: 'Neon' },
  { id: 'grid', label: 'Grade' },
  { id: 'burst', label: 'Raios' },
  { id: 'can', label: 'Cor da lata' },
]

export const DEFAULT_BACKDROP: BackdropId = 'monster'

/** O que o fundo lê do estado: cores da lata (halo do corpo, brilho do M) e a imagem enviada pelo usuário (URL do objeto) */
export type BackdropColors = { glow: string; floor: string; image: string | null }

// ruído fractal em SVG (data URI): quebra o preto chapado sem imagem externa
export const GRAIN_URI =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"

type Ctx = CanvasRenderingContext2D
type Stops = [number, string][]

const channels = (color: string) => {
  const hex = new Color(color).getHex()
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}
const rgba = (color: string, alpha: number) => `rgba(${channels(color).join(',')},${alpha})`
/** escurece (fator < 1) mantendo o matiz */
const shade = (color: string, factor: number) => `#${new Color(color).multiplyScalar(factor).getHexString()}`

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })

/** Elipse de gradiente radial como no CSS (`ellipse rx ry at cx cy`): centro e raios em fração da largura/altura */
function ellipseGradient(ctx: Ctx, w: number, h: number, cx: number, cy: number, rx: number, ry: number, stops: Stops) {
  ctx.save()
  ctx.translate(cx * w, cy * h)
  ctx.scale(rx * w, ry * h)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  for (const [at, color] of stops) gradient.addColorStop(at, color)
  ctx.fillStyle = gradient
  ctx.fillRect(-cx / rx, -cy / ry, 1 / rx, 1 / ry)
  ctx.restore()
}

const vignette = (ctx: Ctx, w: number, h: number, strength: number) =>
  ellipseGradient(ctx, w, h, 0.5, 0.5, 0.75, 0.7, [[0.45, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${strength})`]])

function polygon(ctx: Ctx, w: number, h: number, points: [number, number][], fill: string | CanvasGradient, inset = 0) {
  ctx.beginPath()
  points.forEach(([x, y], index) => {
    const px = (x / 100) * (1 + 2 * inset) * w - inset * w
    const py = (y / 100) * (1 + 2 * inset) * h - inset * h
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

async function paintMonster(ctx: Ctx, w: number, h: number, { glow }: BackdropColors) {
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, w, h)

  // lâminas diagonais (o SVG do fundo ao vivo é 6% maior que o palco, centrado)
  const blade = (points: [number, number][], fill: string) => polygon(ctx, w, h, points, fill, 0.03)
  blade([[76, 0], [100, 0], [100, 100], [94, 100]], '#111')
  blade([[68, 0], [74, 0], [92, 100], [86, 100]], '#0e0e0e')
  blade([[63, 0], [66, 0], [84, 100], [81, 100]], rgba(glow, 0.08))

  // garra gigante e apagada à esquerda (os riscos ficam à direita)
  const claw = await loadImage(clawUrl)
  const drawClaw = (left: number, top: number, height: number, degrees: number, alpha: number) => {
    const width = height * (claw.naturalWidth / claw.naturalHeight)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(left + width / 2, top + height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(claw, -width / 2, -height / 2, width, height)
    ctx.restore()
  }
  const clawHeightLeft = h * 1.1
  drawClaw(-0.06 * w, 0.04 * h, clawHeightLeft, -12, 0.035)

  ellipseGradient(ctx, w, h, 0.5, 0.52, 0.38, 0.46, [[0, rgba(glow, 0.22)], [0.7, rgba(glow, 0)]])
  ellipseGradient(ctx, w, h, 0.5, 0.08, 0.3, 0.4, [[0, 'rgba(255,255,255,0.09)'], [0.7, 'rgba(255,255,255,0)']])
  ellipseGradient(ctx, w, h, 0.5, 0.9, 0.34, 0.14, [[0, rgba(glow, 0.14)], [0.75, rgba(glow, 0)]])
  vignette(ctx, w, h, 0.7)

  // grão
  try {
    const pattern = ctx.createPattern(await loadImage(GRAIN_URI), 'repeat')
    if (pattern) {
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.globalCompositeOperation = 'overlay'
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    }
  } catch {
    // sem grão: o resto do fundo já está pronto
  }
}

function paintStudio(ctx: Ctx, w: number, h: number) {
  // estúdio escuro com luz difusa: tudo é gradiente macio e desfocado, sem nenhuma borda dura
  const room = ctx.createLinearGradient(0, 0, 0, h)
  room.addColorStop(0, '#08090b')
  room.addColorStop(0.62, '#14161a')
  room.addColorStop(1, '#0d0e11')
  ctx.fillStyle = room
  ctx.fillRect(0, 0, w, h)

  const warm = (alpha: number) => `rgba(255,248,235,${alpha})`
  // halos largos e sobrepostos, com queda suave (várias paradas imitam o decaimento real da luz)
  const soft = (cx: number, cy: number, rx: number, ry: number, peak: number) =>
    ellipseGradient(ctx, w, h, cx, cy, rx, ry, [[0, warm(peak)], [0.2, warm(peak * 0.62)], [0.45, warm(peak * 0.28)], [0.72, warm(peak * 0.08)], [1, warm(0)]])
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  soft(0.5, 0.05, 0.75, 0.55, 0.55)
  soft(0.5, 0.42, 0.5, 0.75, 0.3)
  soft(0.5, 0.86, 0.6, 0.22, 0.5)
  ctx.restore()

  // facho difuso: o cone é desenhado e desfocado, então não tem contorno
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.filter = `blur(${Math.round(w * 0.05)}px)`
  const beam = ctx.createLinearGradient(0, 0, 0, h)
  beam.addColorStop(0, warm(0.3))
  beam.addColorStop(1, warm(0.05))
  polygon(ctx, w, h, [[40, -5], [60, -5], [78, 95], [22, 95]], beam)
  ctx.restore()

  ellipseGradient(ctx, w, h, 0.5, 0.9, 0.2, 0.05, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']])
  vignette(ctx, w, h, 0.7)
}

/** Neon: faixas de luz na cor do M do logo, sobre um quase-preto tingido */
function paintNeon(ctx: Ctx, w: number, h: number, { floor }: BackdropColors) {
  ctx.fillStyle = shade(floor, 0.05)
  ctx.fillRect(0, 0, w, h)
  ellipseGradient(ctx, w, h, 0.5, 0.52, 0.7, 0.85, [[0, rgba(floor, 0.5)], [0.5, rgba(shade(floor, 0.4), 0.3)], [1, 'rgba(0,0,0,0)']])
  polygon(ctx, w, h, [[8, 0], [20, 0], [2, 100], [0, 100], [0, 70]], rgba(floor, 0.1))
  polygon(ctx, w, h, [[100, 20], [100, 100], [88, 100]], rgba(floor, 0.12))

  ellipseGradient(ctx, w, h, 0.5, 0.06, 0.3, 0.35, [[0, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']])
  vignette(ctx, w, h, 0.6)
}

/** Grade: piso em perspectiva estilo synthwave na cor do M, com horizonte brilhante atrás da lata */
function paintGrid(ctx: Ctx, w: number, h: number, { floor }: BackdropColors) {
  const horizon = h * 0.58
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#05060a')
  sky.addColorStop(1, shade(floor, 0.22))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = shade(floor, 0.04)
  ctx.fillRect(0, horizon, w, h - horizon)
  ellipseGradient(ctx, w, h, 0.5, 0.58, 0.6, 0.3, [[0, rgba(floor, 0.55)], [1, rgba(floor, 0)]])

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, horizon, w, h - horizon)
  ctx.clip()
  ctx.strokeStyle = rgba(floor, 0.55)
  ctx.lineWidth = Math.max(1, w / 700)
  // linhas que fogem para o ponto de fuga e linhas horizontais cada vez mais espaçadas
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath()
    ctx.moveTo(w * 0.5 + i * w * 0.012, horizon)
    ctx.lineTo(w * 0.5 + i * w * 0.14, h)
    ctx.stroke()
  }
  for (let i = 1; i <= 12; i++) {
    const y = horizon + (i / 12) ** 2.2 * (h - horizon)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.restore()
  // a grade some perto do horizonte
  const fade = ctx.createLinearGradient(0, horizon, 0, horizon + (h - horizon) * 0.35)
  fade.addColorStop(0, shade(floor, 0.04))
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, horizon, w, (h - horizon) * 0.35)
  vignette(ctx, w, h, 0.55)
}

/** Raios: explosão radial de quadrinhos na cor do corpo da lata */
function paintBurst(ctx: Ctx, w: number, h: number, { glow }: BackdropColors) {
  ctx.fillStyle = shade(glow, 0.22)
  ctx.fillRect(0, 0, w, h)
  const cx = w * 0.5
  const cy = h * 0.5
  const reach = Math.hypot(w, h)
  const rays = 24
  const step = (Math.PI * 2) / rays
  ctx.fillStyle = rgba(glow, 0.3)
  for (let i = 0; i < rays; i++) {
    const a1 = i * step
    const a2 = a1 + step / 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a1) * reach, cy + Math.sin(a1) * reach)
    ctx.lineTo(cx + Math.cos(a2) * reach, cy + Math.sin(a2) * reach)
    ctx.closePath()
    ctx.fill()
  }
  ellipseGradient(ctx, w, h, 0.5, 0.5, 0.5, 0.65, [[0, rgba(glow, 0.9)], [0.6, rgba(glow, 0.25)], [1, 'rgba(0,0,0,0)']])
  ellipseGradient(ctx, w, h, 0.5, 0.06, 0.3, 0.35, [[0, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']])
  vignette(ctx, w, h, 0.65)
}

function paintCan(ctx: Ctx, w: number, h: number, { glow }: BackdropColors) {
  ctx.fillStyle = shade(glow, 0.12)
  ctx.fillRect(0, 0, w, h)
  ellipseGradient(ctx, w, h, 0.5, 0.5, 0.75, 0.9, [[0, rgba(glow, 0.95)], [0.55, rgba(shade(glow, 0.45), 0.7)], [1, rgba(shade(glow, 0.1), 0)]])
  ellipseGradient(ctx, w, h, 0.5, 0.08, 0.35, 0.4, [[0, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']])
  vignette(ctx, w, h, 0.5)
}

/** Fundo do usuário: a imagem cobre o palco inteiro (recorte centralizado, sem distorcer); sem imagem, cai na cor da lata */
async function paintCustom(ctx: Ctx, w: number, h: number, colors: BackdropColors) {
  if (!colors.image) return paintCan(ctx, w, h, colors)
  const image = await loadImage(colors.image)
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(image, (w - width) / 2, (h - height) / 2, width, height)
}

export async function paintBackdrop(ctx: Ctx, w: number, h: number, id: BackdropId, colors: BackdropColors) {
  ctx.save()
  ctx.clearRect(0, 0, w, h)
  try {
    if (id === 'monster') await paintMonster(ctx, w, h, colors)
    else if (id === 'studio') paintStudio(ctx, w, h)
    else if (id === 'neon') paintNeon(ctx, w, h, colors)
    else if (id === 'grid') paintGrid(ctx, w, h, colors)
    else if (id === 'burst') paintBurst(ctx, w, h, colors)
    else if (id === 'custom') await paintCustom(ctx, w, h, colors)
    else paintCan(ctx, w, h, colors)
  } finally {
    ctx.restore()
  }
}
