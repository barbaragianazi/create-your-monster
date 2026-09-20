import type { CanFinish } from './canMaterials'

/*
 * OMBRO DA LATA: a transição inclinada entre a parede cilíndrica do corpo e a tampa. Não é um material nem um mesh próprio:
 * no GLB ele é a parte do corpo (Material.005) ACIMA da última linha de vértices da parede (y = WALL_TOP_Y, onde o raio começa
 * a diminuir). No canvas de composição é a faixa de linhas de cima até yToV(WALL_TOP_Y), então cor e arte passam pelo mesmo
 * caminho do corpo (canvas → reprojeção para o UV do GLB) e nada em geometria/UV/GLB é alterado.
 *
 * A configuração separa o valor independente salvo (`color`, `finish`) do estado de herança (`inheritBodyColor`): desmarcar
 * "Mesma cor da lata" recupera a última cor escolhida. Este módulo é folha (não importa canArtwork): quem sabe onde a
 * fronteira está é quem pinta.
 */

/** 'inherit' = mesmo acabamento do corpo */
export type ShoulderFinish = 'inherit' | CanFinish

export type CanShoulderConfig = {
  /** true: o ombro acompanha o corpo (sólido ou degradê); `color` fica guardada, sem uso */
  inheritBodyColor: boolean
  /** cor independente; só vale com `inheritBodyColor = false`, mas nunca é apagada */
  color: string
  finish: ShoulderFinish
}

export const DEFAULT_SHOULDER: CanShoulderConfig = {
  inheritBodyColor: true,
  color: '#000000',
  finish: 'inherit',
}

/**
 * Cor a pintar como fundo do ombro, ou null para deixar o preenchimento do corpo continuar por ele. Com degradê, "continuar"
 * é a própria referência: o ombro mostra a região superior do degradê, sem degrau contra a parede logo abaixo (uma cor sólida
 * escolhida aqui teria corte visível em degradês com componente horizontal). No sólido, isso é exatamente a cor do corpo.
 */
export function resolveShoulderColor(shoulder: CanShoulderConfig): string | null {
  return shoulder.inheritBodyColor ? null : shoulder.color
}

export function resolveShoulderFinish(shoulder: CanShoulderConfig, bodyFinish: CanFinish): CanFinish {
  return shoulder.finish === 'inherit' ? bodyFinish : shoulder.finish
}

/** Pinta o fundo do ombro (linhas 0 … boundaryY) sobre a base do corpo; a arte é desenhada depois, por cima */
export function paintShoulderFill(ctx: CanvasRenderingContext2D, color: string, boundaryY: number) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, ctx.canvas.width, boundaryY)
}
