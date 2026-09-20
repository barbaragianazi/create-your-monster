import { TEXTURE_HEIGHT, TEXTURE_WIDTH } from './canArtwork'
import { DEFAULT_CUSTOM_ARTWORK_PLACEMENT, type CustomArtwork } from './canCustomArtworkLayer'
import { loadImageFile } from './canStickers'

/*
 * CUSTOM ARTWORK: a arte que o usuário cria no gabarito (a lata desenrolada, TEXTURE_WIDTH × TEXTURE_HEIGHT) e envia como
 * PNG/SVG. Entra na composição como um FUNDO: fica acima da cor/degradê/pattern (uma arte opaca os substitui) e SEMPRE abaixo
 * da identidade protegida (M, MONSTER, ENERGY, Flavor, Zero Sugar/rotulagem, textos). Os stickers ficam acima dos dois.
 *
 * Essa ordem NÃO é configurável, e por construção: o estado (canCustomArtworkLayer) não descreve posição em relação à
 * identidade, e canArtwork.paintArtwork desenha o fundo (`paintBackdrop`, onde a arte é pintada) e a identidade
 * (`paintIdentity`) em duas fases fixas, nessa ordem. O gabarito é orientação para a arte ficar boa; quem garante que a
 * identidade nunca se perde é a ordem das fases.
 *
 * Aqui ficam o contrato do arquivo (o que ele deve ser), os textos da UI, os limites dos controles e o carregamento.
 */

/** Texto da UI "Crie sua própria arte" */
export const CUSTOM_ARTWORK_COPY = {
  title: 'Crie sua própria arte',
  description:
    'Baixe o gabarito e crie sua arte no Figma, Photoshop ou outro editor. As áreas indicadas mostram onde a identidade da lata será aplicada pelo Monster Lab.',
  fillAll:
    'Você pode preencher todo o gabarito com sua arte. A identidade principal da lata será aplicada automaticamente sobre a composição.',
  avoidReserved:
    'Evite posicionar textos, logos ou elementos importantes nas áreas reservadas para que eles não fiquem escondidos pela identidade da lata.',
  tip: 'Antes de exportar sua arte, oculte ou remova a camada do gabarito.',
  recommendation:
    'Para melhores resultados, exporte em PNG e mantenha a resolução e proporção do gabarito.',
  downloadTemplate: 'Baixar gabarito',
  uploadArtwork: 'Fazer upload',
  replaceArtwork: 'Substituir arte',
  removeArtwork: 'Remover arte',
} as const

/** O que um arquivo de custom artwork deve ser. A largura/altura de referência são as do gabarito (a composição real) */
export const CUSTOM_ARTWORK_SPEC = {
  width: TEXTURE_WIDTH,
  height: TEXTURE_HEIGHT,
  aspect: TEXTURE_WIDTH / TEXTURE_HEIGHT,
  formats: ['image/png', 'image/svg+xml'] as readonly string[],
  /** desvio relativo tolerado entre a proporção do arquivo e a do gabarito */
  aspectTolerance: 0.01,
  /** abaixo disto (metade da resolução do gabarito) a arte fica visivelmente serrilhada de perto; só vale para PNG */
  minRecommendedWidth: TEXTURE_WIDTH / 2,
  maxBytes: 10 * 1024 * 1024,
} as const

/** A composição inteira cabe no raster do arquivo: PNG maior que o gabarito é reduzido, SVG (vetor) é rasterizado nessa largura */
const LOAD_LIMITS = { maxBytes: CUSTOM_ARTWORK_SPEC.maxBytes, pngEdge: TEXTURE_WIDTH, svgEdge: TEXTURE_WIDTH }

export const CUSTOM_ARTWORK_LIMITS = {
  x: { min: -2.62, max: 2.62 },
  y: { min: -1.5, max: 1.5 },
  scale: { min: 0.25, max: 1.5 },
  rotation: { min: -180, max: 180 },
  opacity: { min: 0, max: 1 },
} as const

export type CustomArtworkIssueCode = 'format' | 'aspect' | 'low-resolution' | 'too-large'

export type CustomArtworkIssue = { code: CustomArtworkIssueCode; message: string }

export type CustomArtworkFileInfo = {
  /** tipo MIME */
  type: string
  bytes: number
  /** dimensões intrínsecas; SVG não tem resolução, só proporção (informe o viewBox) */
  width: number
  height: number
}

/**
 * Problemas objetivos de um arquivo (sem olhar o conteúdo: não se sabe se algo caiu numa área reservada).
 * Lista vazia = sem problemas. São avisos: quem chama decide se bloqueia ou só avisa.
 */
export function checkCustomArtwork({ type, bytes, width, height }: CustomArtworkFileInfo): CustomArtworkIssue[] {
  const issues: CustomArtworkIssue[] = []
  const isSvg = type === 'image/svg+xml'

  if (!CUSTOM_ARTWORK_SPEC.formats.includes(type)) {
    issues.push({ code: 'format', message: 'Use PNG ou SVG.' })
  }
  if (bytes > CUSTOM_ARTWORK_SPEC.maxBytes) {
    issues.push({ code: 'too-large', message: `Arquivo maior que ${CUSTOM_ARTWORK_SPEC.maxBytes / 1024 / 1024} MB.` })
  }
  if (width > 0 && height > 0) {
    const deviation = Math.abs(width / height / CUSTOM_ARTWORK_SPEC.aspect - 1)
    if (deviation > CUSTOM_ARTWORK_SPEC.aspectTolerance) {
      issues.push({
        code: 'aspect',
        message: `Proporção diferente do gabarito (${CUSTOM_ARTWORK_SPEC.width} × ${CUSTOM_ARTWORK_SPEC.height}); a arte será distorcida ou deslocada.`,
      })
    }
    if (!isSvg && width < CUSTOM_ARTWORK_SPEC.minRecommendedWidth) {
      issues.push({ code: 'low-resolution', message: 'Resolução baixa: a arte pode ficar serrilhada.' })
    }
  }
  return issues
}

/** Valida (mesmas regras de segurança dos stickers), decodifica e avalia um arquivo. Lança StickerError com mensagem para o usuário */
export async function loadCustomArtworkFile(file: File): Promise<CustomArtwork> {
  const source = await loadImageFile(file, LOAD_LIMITS)
  const issues = checkCustomArtwork({
    type: source.type === 'png' ? 'image/png' : 'image/svg+xml',
    bytes: file.size,
    width: source.canvas.width,
    height: source.canvas.height,
  })
  return { ...DEFAULT_CUSTOM_ARTWORK_PLACEMENT, name: file.name, source, issues }
}
