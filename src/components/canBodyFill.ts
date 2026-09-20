export type BodyFillType = 'solid' | 'gradient'

export type BodyGradient = {
  startColor: string
  endColor: string
  /** graus, convenção CSS: 0° = de baixo para cima, 90° = da esquerda para a direita, 180° = de cima para baixo */
  angle: number
}

/** Os dois preenchimentos ficam guardados; `type` só escolhe qual é usado (alternar não perde nada) */
export type BodyFill = {
  type: BodyFillType
  solidColor: string
  gradient: BodyGradient
}

export const DEFAULT_BODY_FILL: BodyFill = {
  type: 'solid',
  solidColor: '#ffffff',
  gradient: { startColor: '#7b2cff', endColor: '#00d9ff', angle: 90 },
}

/*
 * Reta do degradê para um retângulo `width × height` centrado em (centerX, centerY), como no CSS linear-gradient:
 * a direção é (sen θ, −cos θ) (y do canvas cresce para baixo) e o comprimento é a projeção do retângulo nessa
 * direção, |w·sen θ| + |h·cos θ|, para que os cantos opostos recebam exatamente a cor inicial e a final.
 */
export function getGradientLine(angle: number, centerX: number, centerY: number, width: number, height: number) {
  const radians = (angle * Math.PI) / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  return {
    x0: centerX - dx * half,
    y0: centerY - dy * half,
    x1: centerX + dx * half,
    y1: centerY + dy * half,
  }
}

/*
 * Base do corpo da lata. O canvas é a lata desenrolada: o centro (x = W/2) é a frente e as bordas (x = 0 e x = W)
 * são a mesma linha, atrás. Um degradê linear com componente horizontal teria um corte brusco ali, então:
 *   - a metade frontal (W/4 … 3W/4, o que se vê de frente) recebe o degradê linear normal;
 *   - as duas quartas partes de trás são o mesmo degradê espelhado, voltando da cor final para a inicial.
 * O resultado é contínuo na costura do UV. Com 0° / 180° (só vertical) o espelhamento é invisível.
 */
export function paintBodyFill(ctx: CanvasRenderingContext2D, fill: BodyFill) {
  const { width, height } = ctx.canvas

  if (fill.type === 'solid') {
    ctx.fillStyle = fill.solidColor
    ctx.fillRect(0, 0, width, height)
    return
  }

  const { startColor, endColor, angle } = fill.gradient
  const { x0, y0, x1, y1 } = getGradientLine(angle, width / 2, height / 2, width / 2, height)
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  gradient.addColorStop(0, startColor)
  gradient.addColorStop(1, endColor)

  ctx.save()
  ctx.fillStyle = gradient
  ctx.fillRect(width / 4, 0, width / 2, height)

  // direita de trás: reflexo em x = 3W/4 → desenha [W/2, 3W/4] do degradê em [3W/4, W]
  ctx.setTransform(-1, 0, 0, 1, (3 * width) / 2, 0)
  ctx.fillRect(width / 2, 0, width / 4, height)

  // esquerda de trás: reflexo em x = W/4 → desenha [W/4, W/2] do degradê em [0, W/4]
  ctx.setTransform(-1, 0, 0, 1, width / 2, 0)
  ctx.fillRect(width / 4, 0, width / 4, height)
  ctx.restore()
}
