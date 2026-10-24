import { paintBackdrop, type BackdropColors, type BackdropId } from './stageBackdrops'

/*
 * Exportação da imagem: a lata é desenhada pelo WebGL já no tamanho final (fundo transparente) e, se o usuário quiser, o fundo do
 * palco é pintado por baixo num canvas 2D do mesmo tamanho.
 */

export type ExportFormat = 'instagram' | 'wide'

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; hint: string; width: number; height: number; fileSuffix: string }> = {
  instagram: { label: 'Instagram', hint: 'Feed 4:5 · 1080×1350', width: 1080, height: 1350, fileSuffix: 'instagram' },
  wide: { label: '16:9', hint: 'Widescreen · 1920×1080', width: 1920, height: 1080, fileSuffix: '16x9' },
}

export type ExportOptions = {
  /** true: lata sobre o fundo escolhido; false: só a lata (PNG transparente) */
  withBackground: boolean
  format: ExportFormat
}

export const DEFAULT_EXPORT: ExportOptions = { withBackground: true, format: 'wide' }

/** Desenha a cena (só a lata, com alfa) no tamanho pedido e devolve o PNG como data URL */
export type CaptureCan = (width: number, height: number) => string

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })

export async function exportImage(capture: CaptureCan, options: ExportOptions, backdrop: BackdropId, colors: BackdropColors) {
  const { width, height, fileSuffix } = EXPORT_FORMATS[options.format]
  const can = await loadImage(capture(width, height))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')
  if (options.withBackground) await paintBackdrop(ctx, width, height, backdrop, colors)
  ctx.drawImage(can, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Não foi possível gerar o PNG')
  const filename = `create-your-monster-${fileSuffix}${options.withBackground ? '' : '-sem-fundo'}.png`

  // Celular: a folha de compartilhamento do sistema deixa salvar nas Fotos ou mandar direto para um app; baixar um blob é pouco confiável no iOS
  if (shouldShare()) {
    const file = new File([blob], filename, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Create Your Monster' })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return // a pessoa fechou a folha: não é erro
        // qualquer outra falha: cai no download comum
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Aparelho de toque que sabe compartilhar arquivos (no desktop o botão continua sendo um download direto) */
export const shouldShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches

