import mCleanSvg from '../assets/branding/monster-m-clean.svg?raw'
import { createCanvas, svgToImage } from './canvasUtils'

// O SVG original não é alterado: é rasterizado (branco sobre preto) para servir como MÁSCARA de transparência (alphaMap).
// A cor do M vem do material, então trocar a cor não refaz a textura. Com máscara em tons de cinza opaca, os mipmaps
// não "sangram" preto nas bordas (o que escureceria o contorno de um M branco).

/** proporção largura/altura do monster-m-clean.svg (viewBox 76 × 111) */
export const LOGO_ASPECT = 76 / 111

const MASK_HEIGHT = 560
let maskPromise: Promise<HTMLCanvasElement> | null = null

export function loadLogoMask() {
  maskPromise ??= svgToImage(mCleanSvg).then((image) => {
    const canvas = createCanvas(Math.round(MASK_HEIGHT * LOGO_ASPECT), MASK_HEIGHT)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    return canvas
  })
  return maskPromise
}
