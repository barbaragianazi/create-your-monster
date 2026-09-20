import { drawLayer } from './canLayer'
import type { StickerSource } from './canStickers'
import type { CustomArtworkIssue } from './canCustomArtwork'

/*
 * A camada de custom artwork na composição (só estado + desenho; regras de arquivo, textos e limites ficam em canCustomArtwork).
 * Módulo folha para canArtwork poder desenhá-la sem ciclo de importação.
 *
 * Não existe campo de ordem: a arte é um FUNDO. canArtwork.paintArtwork a pinta na fase de fundo (`paintBackdrop`), que sempre
 * termina antes da fase da identidade (`paintIdentity`). Nada neste estado pode mudar isso.
 */

/**
 * Posicionamento da arte em relação ao gabarito. Valores neutros (x = y = 0, scale = 1, rotation = 0) = a arte cai exatamente
 * sobre o gabarito, 1:1, e fecha a volta de 360°. x e y são DESLOCAMENTOS a partir daí, em unidades do modelo (y positivo =
 * para cima).
 */
export type CustomArtworkPlacement = {
  visible: boolean
  x: number
  y: number
  scale: number
  /** graus, sentido horário */
  rotation: number
  /** 0..1 */
  opacity: number
}

export type CustomArtwork = CustomArtworkPlacement & {
  name: string
  /** imagem já decodificada (o arquivo original não é mais necessário) */
  source: StickerSource
  /** avisos objetivos sobre o arquivo (proporção, resolução); não bloqueiam o uso */
  issues: readonly CustomArtworkIssue[]
}

export const DEFAULT_CUSTOM_ARTWORK_PLACEMENT: CustomArtworkPlacement = {
  visible: true,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
}

/**
 * Desenha a arte como uma camada "única" do canvas de composição. A largura da arte (com scale = 1) é a circunferência inteira
 * (a largura do canvas), então ela fecha a volta: o que passa de uma borda continua a partir da outra (drawWrapped, em canLayer).
 */
export function paintCustomArtwork(ctx: CanvasRenderingContext2D, artwork: CustomArtwork, pxPerUnit: number) {
  if (!artwork.visible) return

  const { canvas } = artwork.source
  const circumference = ctx.canvas.width / pxPerUnit
  drawLayer(
    ctx,
    canvas,
    { mode: 'single', opacity: artwork.opacity, scale: artwork.scale, rotation: artwork.rotation, x: artwork.x, y: artwork.y },
    {
      // altura, em unidades do modelo, com scale = 1: a largura da arte é a circunferência
      baseHeight: (circumference * canvas.height) / canvas.width,
      pxPerUnit,
      anchorX: ctx.canvas.width / 2 + artwork.x * pxPerUnit,
      anchorY: ctx.canvas.height / 2 - artwork.y * pxPerUnit,
    },
  )
}
