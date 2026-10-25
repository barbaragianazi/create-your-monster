import { invalidateLayerSource, type LayerPlacement } from './canLayer'
import { createCanvas, svgToImage } from './canvasUtils'

/*
 * Patterns: SVGs em src/assets/patterns, carregados sob demanda (import dinâmico → chunk separado).
 * Para adicionar um pattern novo: colocar o SVG na pasta e declarar uma entrada em PATTERNS.
 *
 * Recolorir: cada pattern declara como isolar seus "papéis" de cor (primary/secondary). Cada papel é
 * rasterizado uma vez, em preto, como máscara de alpha; a cor é aplicada no Canvas (source-in). Trocar a cor
 * não recarrega nem reprocessa o SVG, e o arquivo original nunca é alterado.
 */

export type PatternRole = 'primary' | 'secondary'

type PatternRoleDef = { label: string; color: string }

type PatternDef = {
  label: string
  loadSvg: () => Promise<string>
  /** largura / altura do viewBox */
  aspect: number
  /** altura do tile, em unidades do modelo, com scale = 1 */
  baseHeight: number
  /** `secondary` ausente = pattern monocromático */
  roles: { primary: PatternRoleDef; secondary?: PatternRoleDef }
  /** Devolve o SVG só com os elementos do papel, em preto opaco (o resto some) */
  isolate: (svg: string, role: PatternRole) => string
}

function withStyle(svg: string, css: string) {
  const end = svg.lastIndexOf('</svg>')
  if (end < 0) throw new Error('SVG de pattern sem </svg>')
  return `${svg.slice(0, end)}<style>${css}</style>${svg.slice(end)}`
}

function replaceOnce(svg: string, search: string, replacement: string) {
  const index = svg.indexOf(search)
  if (index < 0) throw new Error(`SVG de pattern mudou: trecho não encontrado (${search})`)
  return svg.slice(0, index) + replacement + svg.slice(index + search.length)
}

export const PATTERNS = {
  /*
   * scratches.svg: .st0 = retângulo de fundo (branco), .st1 = os ~21 mil traços (#ABABAB).
   * As classes vêm de <style>, então um <style> extra no fim sobrescreve sem tocar nos elementos.
   */
  scratches: {
    label: 'Riscos',
    loadSvg: () => import('../assets/patterns/scratches.svg?raw').then((m) => m.default),
    aspect: 1,
    baseHeight: 1,
    roles: {
      primary: { label: 'Riscos', color: '#ababab' },
      secondary: { label: 'Fundo', color: '#ffffff' },
    },
    isolate: (svg, role) =>
      withStyle(
        svg,
        role === 'primary'
          ? '.st0{display:none}.st1{fill:#000!important}'
          : '.st1{display:none}.st0{fill:#000!important}',
      ),
  },

  /*
   * waves.svg: retângulo de fundo sem classe (preto), 48 ondas .st0 (#525154) e, por cima, um retângulo .st1
   * com degradê preto → transparente que "apaga" as ondas numa faixa diagonal.
   * Primary: as ondas com esse degradê convertido em máscara (mesmo efeito, mas em alpha, sem depender da cor de fundo).
   * Secondary: o retângulo de fundo.
   */
  waves: {
    label: 'Ondas',
    loadSvg: () => import('../assets/patterns/waves.svg?raw').then((m) => m.default),
    aspect: 1000 / 600,
    baseHeight: 1,
    roles: {
      primary: { label: 'Ondas', color: '#525154' },
      secondary: { label: 'Fundo', color: '#000000' },
    },
    isolate: (svg, role) => {
      if (role === 'secondary') return withStyle(svg, '.st0,.st1{display:none}')

      const masked = replaceOnce(
        replaceOnce(
          svg,
          '<rect width="1000" height="600"/>',
          '<mask id="patternFade" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600">' +
            '<rect width="1000" height="600" fill="#fff"/>' +
            '<rect width="1000" height="600" fill="url(#SVGID_1_)"/>' +
            '</mask><g mask="url(#patternFade)">',
        ),
        '<linearGradient',
        '</g><linearGradient',
      )
      return withStyle(masked, '.st0{fill:#000!important}.st1{display:none}')
    },
  },
} as const satisfies Record<string, PatternDef>

export type PatternId = keyof typeof PATTERNS

export const PATTERN_IDS = Object.keys(PATTERNS) as PatternId[]

export const PATTERN_DEFS: Record<PatternId, PatternDef> = PATTERNS

export type PatternConfig = LayerPlacement & {
  /** 'none' = sem pattern */
  id: PatternId | 'none'
  visible: boolean
  primaryColor: string
  secondaryColor: string
  /** desligado = só a cor principal (fundo transparente, aparece a cor da lata) */
  secondaryEnabled: boolean
}

export const DEFAULT_PATTERN: PatternConfig = {
  id: 'none',
  visible: true,
  primaryColor: '#ffffff',
  secondaryColor: '#000000',
  secondaryEnabled: false,
  mode: 'repeat',
  opacity: 1,
  scale: 1,
  rotation: 0,
  x: 0,
  y: 0,
}

export type LoadedPattern = {
  /** arte já colorida (primary + secondary opcional) */
  source: HTMLCanvasElement
  baseHeight: number
}

// Lado maior da máscara de cada papel (px). Um tile bem maior que isso ficaria suave, mas o custo é fixo.
const RASTER_LONG_EDGE = 2048

async function rasterizeRole(id: PatternId, role: PatternRole) {
  const def = PATTERN_DEFS[id]
  const image = await svgToImage(def.isolate(await def.loadSvg(), role))
  const wide = def.aspect >= 1
  const canvas = createCanvas(
    wide ? RASTER_LONG_EDGE : Math.round(RASTER_LONG_EDGE * def.aspect),
    wide ? Math.round(RASTER_LONG_EDGE / def.aspect) : RASTER_LONG_EDGE,
  )
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

// Só o pattern em uso fica em memória; ao trocar (ou escolher "Nenhum") as máscaras anteriores são descartadas
type LayerCache = { id: PatternId } & Partial<Record<PatternRole, Promise<HTMLCanvasElement>>>
let layerCache: LayerCache | null = null
let tintedCache: { key: string; canvas: HTMLCanvasElement } | null = null
let scratch: HTMLCanvasElement | null = null

export function releasePatternCache() {
  layerCache = null
  if (tintedCache) invalidateLayerSource(tintedCache.canvas)
  tintedCache = null
  scratch = null
}

function getLayer(id: PatternId, role: PatternRole) {
  if (layerCache?.id !== id) {
    releasePatternCache()
    layerCache = { id }
  }
  const cache = layerCache
  cache[role] ??= rasterizeRole(id, role).catch((error) => {
    delete cache[role] // permite tentar de novo
    throw error
  })
  return cache[role]
}

// Pinta a máscara com `color` num canvas de apoio reaproveitado e o devolve (consumir antes da próxima chamada)
function tintLayer(mask: HTMLCanvasElement, color: string) {
  if (!scratch || scratch.width !== mask.width || scratch.height !== mask.height) {
    scratch = createCanvas(mask.width, mask.height)
  }
  const ctx = scratch.getContext('2d')
  if (ctx) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, scratch.width, scratch.height)
    ctx.fillStyle = color
    ctx.fillRect(0, 0, scratch.width, scratch.height)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(mask, 0, 0)
  }
  return scratch
}

export async function loadPattern(config: PatternConfig): Promise<LoadedPattern | null> {
  if (config.id === 'none') {
    releasePatternCache()
    return null
  }
  if (!config.visible) return null

  const { id } = config
  const def = PATTERN_DEFS[id]
  const secondaryColor = def.roles.secondary && config.secondaryEnabled ? config.secondaryColor : null

  try {
    const [primary, secondary] = await Promise.all([
      getLayer(id, 'primary'),
      secondaryColor ? getLayer(id, 'secondary') : null,
    ])

    const key = `${id}|${config.primaryColor}|${secondaryColor ?? '-'}`
    if (tintedCache?.key !== key) {
      // reaproveita o canvas (16 MB) enquanto o tamanho não muda; as versões reduzidas dele ficam inválidas
      const canvas =
        tintedCache?.canvas.width === primary.width && tintedCache.canvas.height === primary.height
          ? tintedCache.canvas
          : createCanvas(primary.width, primary.height)
      invalidateLayerSource(canvas)

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (secondary && secondaryColor) ctx.drawImage(tintLayer(secondary, secondaryColor), 0, 0)
        ctx.drawImage(tintLayer(primary, config.primaryColor), 0, 0)
      }
      tintedCache = { key, canvas }
    }

    return { source: tintedCache.canvas, baseHeight: def.baseHeight }
  } catch (error) {
    console.error(`Falha ao carregar o pattern "${id}"`, error)
    return null
  }
}
