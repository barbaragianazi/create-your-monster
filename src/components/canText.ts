import {
  DEFAULT_TEXT_STROKE,
  drawText,
  loadTextStyleFont,
  type TextElement,
  type TextFit,
  type TextPlacement,
} from './canTypography'

// Elementos de texto personalizáveis da lata. O desenho e o modelo de estilo vivem em canTypography; aqui ficam só as
// definições de cada elemento (estrutura própria) e os valores padrão. Elementos com identidade fixa ou função
// regulatória (Monster M, MONSTER, ENERGY, selo de alto em açúcar) NÃO são textos livres e não passam por aqui.

export type TextBackground = {
  visible: boolean
  color: string
  /** Dimensões em unidades do modelo, independentes da tipografia. */
  width: number
  height: number
  borderRadius: number
}

export const TEXT_BACKGROUND_LIMITS = {
  width: { min: 0.2, max: 2.6 },
  height: { min: 0.05, max: 0.8 },
} as const

/** Limites dos controles DEV e da manipulação direta para a posição dos textos (uma só fonte) */
export const TEXT_POSITION_LIMITS = { x: { min: -2.6, max: 2.6 }, y: { min: -1.6, max: 2 } } as const

export type TextElementConfig = TextElement & {
  /** faixa atrás do texto (só para elementos que declaram `background` na definição) */
  background?: TextBackground
}

export type TextElementId = 'flavor' | 'zeroSugar' | 'volume' | 'topText'

export type TextsConfig = Record<TextElementId, TextElementConfig>

export type TextElementDef = {
  id: TextElementId
  label: string
  /** 'full' = controles tipográficos completos; 'basic' = estrutura própria preservada (só texto, cor, faixa, tamanho, posição) */
  controls: 'full' | 'basic'
  /** Habilita a faixa e a centralização pelos limites visíveis dos caracteres. */
  background?: boolean
  /** repete o texto ao redor de toda a lata (alinhamento, rotação e largura máxima não se aplicam) */
  ring?: { gap: number }
}

// Ordem = ordem de desenho (de baixo para cima)
export const TEXT_ELEMENTS: readonly TextElementDef[] = [
  { id: 'flavor', label: 'Flavor Name', controls: 'full' },
  {
    id: 'zeroSugar',
    label: 'Zero Sugar',
    controls: 'basic',
    background: true,
  },
  { id: 'volume', label: 'Volume', controls: 'full' },
  { id: 'topText', label: 'Texto superior', controls: 'full', ring: { gap: 4 } },
]

export const DEFAULT_TEXTS: TextsConfig = {
  flavor: {
    content: 'FLAVOR NAME',
    visible: true,
    x: 0,
    y: -0.96,
    style: {
      fontFamily: 'impact',
      fontWeight: 400,
      fontSize: 0.23,
      color: '#aec90b',
      letterSpacing: 0.01,
      textAlign: 'center',
      uppercase: false,
      rotation: 0,
      stroke: DEFAULT_TEXT_STROKE,
      maxWidth: 2.0,
      autoFit: true,
    },
  },
  zeroSugar: {
    content: 'ZERO SUGAR',
    visible: true,
    x: 0,
    y: -1.19,
    style: {
      fontFamily: 'impact',
      fontWeight: 400,
      fontSize: 0.1,
      color: '#ffffff',
      letterSpacing: 0.1,
      textAlign: 'center',
      uppercase: false,
      rotation: 0,
      stroke: DEFAULT_TEXT_STROKE,
      maxWidth: 1.4,
      autoFit: true,
    },
    background: { visible: true, color: '#1d1d1b', width: 1.62, height: 0.14, borderRadius: 0.01 },
  },
  volume: {
    content: '473 ml',
    visible: true,
    x: 0.95,
    y: -1.52,
    style: {
      fontFamily: 'arial-narrow',
      fontWeight: 700,
      fontSize: 0.075,
      color: '#9a9a9a',
      letterSpacing: 0.08,
      textAlign: 'center',
      uppercase: false,
      rotation: 0,
      stroke: DEFAULT_TEXT_STROKE,
      maxWidth: 0.9,
      autoFit: true,
    },
  },
  topText: {
    content: 'TAURINE + GINSENG',
    visible: true,
    x: 0,
    y: 1.83,
    style: {
      fontFamily: 'arial-narrow',
      fontWeight: 700,
      fontSize: 0.12,
      color: '#8a8a8a',
      letterSpacing: 0.22,
      textAlign: 'center',
      uppercase: false,
      rotation: 0,
      stroke: DEFAULT_TEXT_STROKE,
      maxWidth: 1.6,
      autoFit: true,
    },
  },
}

// Garante as fontes prontas antes de medir/desenhar (cada família+peso é carregada uma única vez; ver canTypography)
export async function loadTextFonts(texts: TextsConfig) {
  await Promise.all(TEXT_ELEMENTS.map((def) => loadTextStyleFont(texts[def.id].style)))
}

export function drawTextElement(
  ctx: CanvasRenderingContext2D,
  def: TextElementDef,
  config: TextElementConfig,
  placement: TextPlacement,
): TextFit | null {
  if (!config.visible) return null

  const background =
    def.background && config.background?.visible ? config.background : undefined
  return drawText(ctx, config.content, config.style, placement, { background, centerInk: def.background, ring: def.ring })
}
