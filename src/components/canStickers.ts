import { createCanvas } from './canvasUtils'

/*
 * Stickers: imagens (PNG/SVG) enviadas pelo usuário, processadas só no navegador.
 *
 * Cada arquivo vira um StickerSource: um canvas com a imagem já decodificada (fundo transparente preservado).
 * Depois disso o arquivo, o Blob e qualquer object URL deixam de ser necessários, então nada fica para ser
 * revogado/fechado e o canvas é coletado pelo GC quando nenhum sticker o referencia mais. Duplicatas
 * compartilham o mesmo StickerSource; cada Sticker tem seu próprio id e suas próprias transformações.
 */

export const STICKER_MAX_BYTES = 5 * 1024 * 1024
export const STICKER_HINT = 'Use PNG com fundo transparente ou SVG para melhores resultados. Máx. 5 MB por arquivo.'

const PNG_MAX_SIDE = 8192 // evita "bombas de descompressão": 5 MB de PNG podem ser dezenas de milhares de px
const PNG_RASTER_EDGE = 2048
const SVG_RASTER_EDGE = 1536
/** maior lado do sticker, em unidades do modelo, com scale = 1 */
const BASE_SIZE = 0.6

/** Limites dos controles DEV e da manipulação direta (uma só fonte) */
export const STICKER_LIMITS = {
  x: { min: -2.62, max: 2.62 },
  y: { min: -1.7, max: 2.1 },
  scale: { min: 0.1, max: 4 },
  rotation: { min: 0, max: 360 },
} as const

export type StickerType = 'png' | 'svg'

export type StickerSource = {
  type: StickerType
  canvas: HTMLCanvasElement
}

/** A ordem no array é a ordem de desenho (o último fica na frente); não há zIndex separado para não duplicar estado */
export type Sticker = {
  id: string
  name: string
  source: StickerSource
  visible: boolean
  /** deslocamento horizontal a partir do centro frontal, em unidades do modelo */
  x: number
  /** posição vertical do centro, em unidades do modelo (y do GLB, positivo = para cima) */
  y: number
  /** multiplicador sobre o tamanho base; a proporção do arquivo é sempre preservada */
  scale: number
  /** graus, sentido horário */
  rotation: number
  /** 0..1 */
  opacity: number
}

/** Erro com mensagem própria para o usuário */
export class StickerError extends Error {}

let idCounter = 0
function newStickerId() {
  return `sticker-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** altura, em unidades do modelo, com scale = 1 (o maior lado vale BASE_SIZE) */
export function stickerBaseHeight({ canvas }: StickerSource) {
  const aspect = canvas.width / canvas.height
  return aspect >= 1 ? BASE_SIZE / aspect : BASE_SIZE
}

export function createSticker(name: string, source: StickerSource, slot: number): Sticker {
  return {
    id: newStickerId(),
    name,
    source,
    visible: true,
    // longe do centro (onde ficam o M e os textos, que os stickers cobririam); cada novo sticker sobe/desce um degrau
    x: 1.1,
    y: 0.9 - 0.4 * (slot % 5),
    scale: 1,
    rotation: 0,
    opacity: 1,
  }
}

export function duplicateSticker(sticker: Sticker): Sticker {
  return { ...sticker, id: newStickerId(), name: `${sticker.name} copy`, x: sticker.x + 0.15, y: sticker.y - 0.15 }
}

// ---------------------------------------------------------------------------------------------------------
// Validação e carregamento
// ---------------------------------------------------------------------------------------------------------

const ALLOWED_MIME: Record<StickerType, string> = { png: 'image/png', svg: 'image/svg+xml' }

function detectType(file: File): StickerType {
  const name = file.name.toLowerCase()
  const type: StickerType | null = name.endsWith('.png') ? 'png' : name.endsWith('.svg') ? 'svg' : null
  // alguns sistemas não informam o MIME (''); se informam, tem que bater com a extensão
  if (!type || (file.type !== '' && file.type !== ALLOWED_MIME[type])) {
    throw new StickerError('Formato não suportado. Use PNG ou SVG.')
  }
  return type
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

async function readPngSize(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer())
  const isPng = bytes.length === 24 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
  const isIhdr = isPng && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR'
  if (!isIhdr) throw new StickerError('O arquivo não é um PNG válido.')
  const view = new DataView(bytes.buffer)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

async function loadPng(file: File, rasterEdge: number): Promise<HTMLCanvasElement> {
  const size = await readPngSize(file)
  if (!size.width || !size.height || Math.max(size.width, size.height) > PNG_MAX_SIDE) {
    throw new StickerError(`Imagem muito grande. O máximo é ${PNG_MAX_SIDE} px por lado.`)
  }

  // Decodifica direto do Blob (sem object URL) e já reduz, se for maior que o necessário
  const target = fitWithin(size.width, size.height, rasterEdge)
  const shrink = target.width < size.width || target.height < size.height
  const bitmap = await createImageBitmap(
    file,
    shrink ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' } : undefined,
  )
  try {
    const canvas = createCanvas(bitmap.width, bitmap.height)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    return canvas
  } finally {
    bitmap.close()
  }
}

// --- SVG (conteúdo não confiável) ---

const BLOCKED_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object', 'audio', 'video', 'link'])
const SAFE_DATA_URI = /^data:image\/(png|jpe?g|gif|webp);base64,/i

// Referências permitidas: âncoras internas (#id) e imagens embutidas. Qualquer outra é recurso externo.
function isSafeReference(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('#') || SAFE_DATA_URI.test(trimmed)
}

function hasUnsafeCss(css: string) {
  if (/@import|expression\s*\(|javascript:/i.test(css)) return true
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (!isSafeReference(match[2])) return true
  }
  return false
}

const SVG_REJECTED = 'SVG não permitido: contém scripts ou recursos externos.'

/**
 * Analisa o SVG como texto/XML (DOMParser não executa scripts nem carrega recursos e o resultado nunca é
 * inserido no documento) e rejeita o que puder rodar código ou buscar algo fora do arquivo.
 * Devolve o tamanho intrínseco do desenho.
 */
function inspectSvg(text: string) {
  if (/<!ENTITY/i.test(text)) throw new StickerError(SVG_REJECTED)

  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length > 0 || root.localName !== 'svg') {
    throw new StickerError('O arquivo não é um SVG válido.')
  }

  for (const element of doc.querySelectorAll('*')) {
    if (BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) throw new StickerError(SVG_REJECTED)
    if (element.localName === 'style' && hasUnsafeCss(element.textContent ?? '')) throw new StickerError(SVG_REJECTED)

    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value
      const isReference = name === 'href' || name === 'xlink:href' || name === 'src'
      if (
        name.startsWith('on') ||
        /javascript:/i.test(value) ||
        (isReference && !isSafeReference(value)) ||
        ((name === 'style' || /url\(/i.test(value)) && hasUnsafeCss(value))
      ) {
        throw new StickerError(SVG_REJECTED)
      }
    }
  }

  const length = (value: string | null) => {
    const number = parseFloat(value ?? '')
    return value && !value.trim().endsWith('%') && number > 0 ? number : 0
  }
  let width = length(root.getAttribute('width'))
  let height = length(root.getAttribute('height'))
  if (!width || !height) {
    const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    if (box?.length === 4 && box[2] > 0 && box[3] > 0) [width, height] = [box[2], box[3]]
  }
  if (!width || !height) throw new StickerError('SVG sem dimensões (width/height ou viewBox).')
  return { width, height }
}

async function loadSvg(file: File, rasterEdge: number): Promise<HTMLCanvasElement> {
  const text = await file.text()
  const intrinsic = inspectSvg(text)
  // Escala até o lado maior valer `rasterEdge`: vetor, então ampliar não perde nitidez
  const ratio = rasterEdge / Math.max(intrinsic.width, intrinsic.height)
  const width = Math.max(1, Math.round(intrinsic.width * ratio))
  const height = Math.max(1, Math.round(intrinsic.height * ratio))

  // <img> com SVG é "modo imagem": scripts e recursos externos não são executados/carregados (defesa extra)
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new StickerError('Não foi possível ler o SVG.'))
      img.src = url
    })
    const canvas = createCanvas(width, height)
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Limites de um carregamento: tamanho do arquivo e maior lado do raster (PNG é só reduzido; SVG é vetor e vai até esse lado) */
export type ImageFileLimits = { maxBytes: number; pngEdge: number; svgEdge: number }

const STICKER_FILE_LIMITS: ImageFileLimits = { maxBytes: STICKER_MAX_BYTES, pngEdge: PNG_RASTER_EDGE, svgEdge: SVG_RASTER_EDGE }

/** Valida (mesmas regras de segurança para qualquer imagem do usuário) e decodifica um PNG/SVG. Lança StickerError com mensagem para o usuário. */
export async function loadImageFile(file: File, limits: ImageFileLimits): Promise<StickerSource> {
  const type = detectType(file)
  if (file.size === 0) throw new StickerError('O arquivo está vazio.')
  if (file.size > limits.maxBytes) {
    throw new StickerError(`Arquivo muito grande. O limite é ${limits.maxBytes / (1024 * 1024)} MB.`)
  }

  try {
    return { type, canvas: await (type === 'png' ? loadPng(file, limits.pngEdge) : loadSvg(file, limits.svgEdge)) }
  } catch (error) {
    if (error instanceof StickerError) throw error
    console.error('Falha ao processar imagem', error)
    throw new StickerError('Não foi possível ler a imagem.')
  }
}

/** Valida e decodifica um arquivo de sticker. Lança StickerError com mensagem para o usuário. */
export function loadStickerFile(file: File): Promise<StickerSource> {
  return loadImageFile(file, STICKER_FILE_LIMITS)
}
