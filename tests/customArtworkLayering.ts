import { DEFAULT_ARTWORK, TEXTURE_HEIGHT, TEXTURE_WIDTH, createArtworkTarget, loadArtwork, paintArtwork } from '../src/components/canArtwork'
import { DEFAULT_BODY_FILL } from '../src/components/canBodyFill'
import { DEFAULT_CUSTOM_ARTWORK_PLACEMENT, type CustomArtwork } from '../src/components/canCustomArtworkLayer'
import { DEFAULT_PATTERN } from '../src/components/canPattern'
import { DEFAULT_SUGAR } from '../src/components/canSugarLabel'
import { DEFAULT_TEXTS, loadTextFonts } from '../src/components/canText'
import { IDENTITY_UV_LAYOUT } from '../src/components/canUvLayout'

/**
 * Run in a real browser through Vite:
 *   import('/tests/customArtworkLayering.ts').then(m => m.testCustomArtworkLayering()).
 *
 * Garante que a custom artwork nunca fica acima da identidade: pinta a composição sem arte (A) e com uma arte 100% opaca, de
 * cores fortes, cobrindo todo o gabarito (B). Toda tinta escura da identidade (contornos do M, do MONSTER e do ENERGY, faixa do
 * Zero Sugar) tem que ser idêntica em A e B, e a arte tem que cobrir o fundo. Também confere o fechamento em 360°.
 */
export async function testCustomArtworkLayering() {
  const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }

  // arte opaca: listras verticais fortes (uma centrada na emenda x = 0) com faixas horizontais; periódica em x
  const art = document.createElement('canvas')
  art.width = TEXTURE_WIDTH
  art.height = TEXTURE_HEIGHT
  const artCtx = art.getContext('2d')!
  const colors = ['#ff00c8', '#00dcff', '#ffe600', '#ff5a00', '#7800ff', '#00ff78', '#ff003c', '#005aff']
  const stripe = TEXTURE_WIDTH / colors.length
  for (let i = 0; i <= colors.length; i++) {
    artCtx.fillStyle = colors[i % colors.length]
    artCtx.fillRect(-stripe / 2 + i * stripe, 0, stripe, TEXTURE_HEIGHT)
  }
  const customArtwork: CustomArtwork = {
    ...DEFAULT_CUSTOM_ARTWORK_PLACEMENT,
    name: 'opaque.png',
    source: { type: 'png', canvas: art },
    issues: [],
  }

  await loadTextFonts(DEFAULT_TEXTS)
  const loaded = await loadArtwork(DEFAULT_ARTWORK, DEFAULT_PATTERN)
  const paint = (custom: CustomArtwork | null) => {
    const target = createArtworkTarget(DEFAULT_BODY_FILL, 1, IDENTITY_UV_LAYOUT)
    paintArtwork(target, DEFAULT_BODY_FILL, null, null, custom, [], DEFAULT_ARTWORK, loaded, DEFAULT_TEXTS, DEFAULT_SUGAR)
    return target.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data
  }

  const without = paint(null)
  const withArt = paint(customArtwork)

  let identityPixels = 0
  let coveredPixels = 0
  let whitePixels = 0
  let recoloredIdentity = 0
  for (let i = 0; i < without.length; i += 4) {
    const luminance = 0.3 * without[i] + 0.59 * without[i + 1] + 0.11 * without[i + 2]
    if (luminance < 40) {
      // tinta escura da identidade (o corpo padrão é branco): idêntica com e sem arte
      identityPixels++
      if (without[i] !== withArt[i] || without[i + 1] !== withArt[i + 1] || without[i + 2] !== withArt[i + 2]) recoloredIdentity++
    } else if (without[i] > 235 && without[i + 1] > 235 && without[i + 2] > 235) {
      // branco puro: o fundo (a arte opaca tem que cobri-lo) ou o preenchimento branco do MONSTER/ENERGY (fica como está: identidade)
      whitePixels++
      if (withArt[i] !== without[i] || withArt[i + 1] !== without[i + 1] || withArt[i + 2] !== without[i + 2]) coveredPixels++
    }
  }
  assert(identityPixels > 50_000, `pouca tinta de identidade encontrada (${identityPixels}); o teste não está medindo nada`)
  // o resto do branco são os preenchimentos brancos da identidade (poucos %), que a arte não pode cobrir
  assert(coveredPixels / whitePixels > 0.9, `a arte opaca cobriu só ${coveredPixels} de ${whitePixels} pixels de fundo`)
  assert(recoloredIdentity === 0, `${recoloredIdentity} pixels da identidade foram alterados pela custom artwork`)

  // 360°: a última coluna e a primeira são vizinhas na lata; a listra da emenda é contínua (mesma cor dos dois lados)
  const row = 1500
  const px = (data: Uint8ClampedArray, x: number) => [0, 1, 2].map((c) => data[(row * TEXTURE_WIDTH + x) * 4 + c])
  const left = px(withArt, 0)
  const right = px(withArt, TEXTURE_WIDTH - 1)
  assert(left.every((value, c) => value === right[c]), `descontinuidade na emenda: ${left} vs ${right}`)

  // controle: se a arte fosse desenhada DEPOIS da identidade, o teste acima teria que reprovar (prova que ele mede a ordem)
  const control = createArtworkTarget(DEFAULT_BODY_FILL, 1, IDENTITY_UV_LAYOUT)
  paintArtwork(control, DEFAULT_BODY_FILL, null, null, null, [], DEFAULT_ARTWORK, loaded, DEFAULT_TEXTS, DEFAULT_SUGAR)
  const controlCtx = control.canvas.getContext('2d', { willReadFrequently: true })!
  controlCtx.drawImage(art, 0, 0)
  const above = controlCtx.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data
  let changed = 0
  for (let i = 0; i < without.length; i += 4) {
    if (0.3 * without[i] + 0.59 * without[i + 1] + 0.11 * without[i + 2] < 40 && without[i] !== above[i]) changed++
  }
  assert(changed > 50_000, 'o controle negativo não detectou a arte por cima da identidade: o teste não é confiável')

  return { identityPixels, coveredPixels, whitePixels, seam: left, controlChangedIfAbove: changed }
}
