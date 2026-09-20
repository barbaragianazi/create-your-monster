import { DEFAULT_TEXTS, TEXT_ELEMENTS, drawTextElement } from '../src/components/canText'

/** Run in a real browser through Vite: import('/tests/zeroSugar.canvas.ts').then(m => m.testZeroSugarCanvas()). */
export function testZeroSugarCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 4096
  canvas.height = 900
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const def = TEXT_ELEMENTS.find((item) => item.id === 'zeroSugar')!
  let cases = 0
  const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
  const colors = ['#000000', '#ffffff', '#a030d0']

  for (const pxPerUnit of [180, 360, 4096 / (2 * Math.PI * 0.834)]) {
    for (const color of colors) {
      for (const width of [0.2, 0.72, 2.6]) {
        for (const height of [0.05, 0.14, 0.8]) {
          for (const borderRadius of [0, Math.min(width, height) / 4, Math.min(width, height) / 2, 10]) {
            const config = structuredClone(DEFAULT_TEXTS.zeroSugar)
            config.content = '' // Isolate the background, including where the text normally covers it.
            config.background = { visible: true, color, width, height, borderRadius }
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            drawTextElement(ctx, def, config, { centerX: 2048.37, centerY: 450.61, pxPerUnit, canvasWidth: 4096, stretchX: 1 })
            const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
            // A central strip extending across most of the interior: exact color and opaque alpha.
            const halfW = width * pxPerUnit / 4
            const halfH = height * pxPerUnit / 4
            const x = Math.ceil(2048.37 - halfW), y = Math.ceil(450.61 - halfH)
            const pixels = ctx.getImageData(x, y, Math.max(1, Math.floor(halfW * 2) - 1), Math.max(1, Math.floor(halfH * 2) - 1)).data
            for (let i = 0; i < pixels.length; i += 4) {
              assert(pixels[i] === rgb[0] && pixels[i + 1] === rgb[1] && pixels[i + 2] === rgb[2] && pixels[i + 3] === 255,
                `Background discontinuity: ${JSON.stringify({pxPerUnit, color, width, height, borderRadius, i})}`)
            }
            cases++
          }
        }
      }
    }
  }

  canvas.width = 1600
  // Ink bounds must remain centered for different sizes, weights, spacing, and backgrounds.
  for (const fontSize of [0.05, 0.1, 0.3, 0.6]) {
    for (const fontWeight of [400, 700] as const) {
      for (const letterSpacing of [-0.1, 0, 0.1, 0.5]) {
        let firstSignature = ''
        for (const width of [0.2, 0.72, 2.6]) {
          const config = structuredClone(DEFAULT_TEXTS.zeroSugar)
          config.style = { ...config.style, fontFamily: 'arial', fontSize, fontWeight, letterSpacing, autoFit: false, color: '#ffffff' }
          config.background = { visible: true, color: '#000000', width, height: width / 3, borderRadius: width / 6 }
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const fit = drawTextElement(ctx, def, config, { centerX: 800, centerY: 450, pxPerUnit: 180, canvasWidth: 1600, stretchX: 1 })!
          assert(fit.size === fontSize * 180, 'Background resized the text')
          const pixels = ctx.getImageData(0, 0, 1600, 900).data
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          for (let y = 0; y < 900; y++) for (let x = 0; x < 1600; x++) {
            const i = (y * 1600 + x) * 4
            if (pixels[i] > 128 && pixels[i + 3] > 128) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x)
              minY = Math.min(minY, y); maxY = Math.max(maxY, y)
            }
          }
          assert(Math.abs((minX + maxX + 1) / 2 - 800) <= 1, 'Text not horizontally centered')
          assert(Math.abs((minY + maxY + 1) / 2 - 450) <= 1, 'Text not vertically centered')
          const signature = [minX, maxX, minY, maxY].join(',')
          if (firstSignature) assert(signature === firstSignature, 'Background dimensions changed text bounds')
          firstSignature = signature
          cases++
        }
      }
    }
  }

  ctx.translate(12, 34)
  ctx.globalAlpha = 0.2
  ctx.globalCompositeOperation = 'multiply'
  const transform = ctx.getTransform().toString()
  drawTextElement(ctx, def, DEFAULT_TEXTS.zeroSugar, { centerX: 800, centerY: 450, pxPerUnit: 180, canvasWidth: 1600, stretchX: 1 })
  assert(ctx.getTransform().toString() === transform && ctx.globalAlpha === 0.2 && ctx.globalCompositeOperation === 'multiply', 'Canvas state leaked')
  return { passed: cases, canvasStateRestored: true }
}
