/*
 * O canvas de composição é a volta inteira da lata: x = 0 e x = canvas.width são a MESMA linha (atrás). Um elemento que
 * passa de uma borda continua, sem corte, a partir da outra. Toda camada posicionável (SVG, texto, sticker, faixa, arte
 * futura) desenha por aqui em vez de repetir a lógica de cópias.
 */

/**
 * Chama `draw(offsetX)` para cada cópia do elemento que aparece no canvas. O elemento ocupa [left, right] em x (px do canvas,
 * antes de qualquer envolvimento; pode até estar totalmente fora dele); `draw` deve desenhá-lo deslocado de `offsetX`.
 * Um elemento inteiro dentro do canvas gera uma única chamada, com offsetX = 0.
 */
export function drawWrapped(canvasWidth: number, left: number, right: number, draw: (offsetX: number) => void) {
  for (const offset of [0, -canvasWidth, canvasWidth]) {
    if (right + offset > 0 && left + offset < canvasWidth) draw(offset)
  }
}
