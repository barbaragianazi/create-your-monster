import { DEFAULT_ARTWORK, PX_PER_UNIT, TEXTURE_HEIGHT, TEXTURE_WIDTH, surfaceToCanvas, vToY, yToV } from '../src/components/canArtwork'
import { DEFAULT_CUSTOM_ARTWORK_PLACEMENT, type CustomArtwork } from '../src/components/canCustomArtworkLayer'
import {
  CUSTOM_ARTWORK_ID,
  collectInteractiveElements,
  hitTest,
  movePatch,
  patchArtwork,
  patchStickers,
  patchTexts,
  rotationPatch,
  scalePatch,
  wrapDelta,
  wrapX,
  type InteractiveElement,
} from '../src/components/canInteraction'
import { DEFAULT_SUGAR } from '../src/components/canSugarLabel'
import { DEFAULT_TEXTS, loadTextFonts } from '../src/components/canText'
import { compositionToUv, uvToComposition, type BodyUvLayout } from '../src/components/canUvLayout'
import { createSticker } from '../src/components/canStickers'

/** Run in a real browser through Vite: import('/tests/canInteraction.ts').then(m => m.testCanInteraction()). */
export async function testCanInteraction() {
  let checks = 0
  const assert = (condition: boolean, message: string) => {
    checks++
    if (!condition) throw new Error(message)
  }
  const near = (a: number, b: number, tolerance: number, message: string) => assert(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`)

  await loadTextFonts(DEFAULT_TEXTS)
  const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })
  const sticker = (slot: number) => createSticker(`s${slot}`, { type: 'png', canvas: canvas(200, 100) }, slot)
  const customArtwork: CustomArtwork = {
    ...DEFAULT_CUSTOM_ARTWORK_PLACEMENT,
    name: 'art.png',
    source: { type: 'png', canvas: canvas(TEXTURE_WIDTH, TEXTURE_HEIGHT) },
    issues: [],
  }
  const state = { artwork: DEFAULT_ARTWORK, texts: DEFAULT_TEXTS, sugar: DEFAULT_SUGAR, stickers: [] as ReturnType<typeof sticker>[], customArtwork: null as CustomArtwork | null }
  const find = (elements: InteractiveElement[], id: string) => elements.find((element) => element.id === id)!

  // --- bounds vêm dos mesmos números da renderização ---
  let elements = collectInteractiveElements(state)
  assert(['m', 'wordmark', 'energy', 'flavor', 'zeroSugar'].every((id) => elements.some((e) => e.id === id)), 'elementos de identidade presentes')
  const m = find(elements, 'm')
  const surfaceM = surfaceToCanvas(DEFAULT_ARTWORK.m.x, DEFAULT_ARTWORK.m.y)
  near(m.center.x, surfaceM.x, 0.01, 'centro x do M = surfaceToCanvas')
  near(m.center.y, surfaceM.y, 0.01, 'centro y do M = surfaceToCanvas')
  near(m.height, 2 * DEFAULT_ARTWORK.m.scale * PX_PER_UNIT, 0.01, 'altura do M = baseHeight × scale')

  // --- hit-test: dentro / fora, camada e ordem ---
  assert(hitTest(elements, m.center)?.id === 'm', 'centro do M seleciona o M')
  assert(hitTest(elements, { x: 50, y: 50 }) === null, 'canto vazio não seleciona nada')
  const band = find(elements, 'zeroSugar')
  assert(hitTest(elements, band.center)?.id === 'zeroSugar', 'centro da faixa seleciona o Zero Sugar')

  // sticker sobre o M: o sticker (por cima) vence; fora dele, o M
  state.stickers = [sticker(0)]
  state.stickers[0] = { ...state.stickers[0], x: 0, y: DEFAULT_ARTWORK.m.y, scale: 0.5 }
  elements = collectInteractiveElements(state)
  assert(hitTest(elements, find(elements, 'm').center)?.id.startsWith('sticker:') === true, 'sticker acima do M é escolhido na sobreposição')
  const stickerEl = elements.find((e) => e.kind === 'sticker')!
  assert(hitTest(elements, { x: m.center.x, y: stickerEl.center.y - stickerEl.height / 2 - 40 })?.id === 'm', 'logo fora do sticker, o M')

  // dois stickers: o último do array é o de cima
  state.stickers = [{ ...sticker(0), x: 0, y: 0 }, { ...sticker(1), x: 0, y: 0 }]
  elements = collectInteractiveElements(state)
  const top = elements.filter((e) => e.kind === 'sticker').at(-1)!
  assert(hitTest(elements, top.center)?.id === top.id, 'entre stickers sobrepostos vence o de cima')
  state.stickers = []

  // custom artwork: sempre abaixo da identidade, mesmo cobrindo tudo
  state.customArtwork = customArtwork
  elements = collectInteractiveElements(state)
  const art = find(elements, CUSTOM_ARTWORK_ID)
  assert(art.backdrop && art.zOrder < find(elements, 'm').zOrder, 'custom artwork tem o menor zOrder (abaixo da identidade)')
  assert(hitTest(elements, find(elements, 'm').center)?.id === 'm', 'sobre o M, o M vence a custom artwork')
  assert(hitTest(elements, { x: 50, y: 50 })?.id === CUSTOM_ARTWORK_ID, 'em área vazia a custom artwork é selecionada')
  state.customArtwork = null

  // --- rotação: o hit-test usa o retângulo girado, não a caixa que o envolve ---
  const rotated: InteractiveElement = { ...m, rotation: 45, center: { x: 1000, y: 1000 }, width: 400, height: 40 }
  assert(hitTest([rotated], { x: 1000 + 120, y: 1000 + 120 })?.id === 'm', 'ao longo da diagonal (retângulo girado 45°) acerta')
  assert(hitTest([rotated], { x: 1000 + 120, y: 1000 - 120 }) === null, 'na outra diagonal, dentro da AABB mas fora do retângulo, erra')

  // --- costura: elemento atravessando x = largura continua em x = 0 ---
  const seam: InteractiveElement = { ...m, center: { x: TEXTURE_WIDTH - 20, y: 800 }, width: 200, height: 200, rotation: 0 }
  assert(hitTest([seam], { x: 30, y: 800 })?.id === 'm', 'do outro lado da costura (x = 30) ainda acerta')
  assert(hitTest([seam], { x: 2000, y: 800 }) === null, 'longe da costura não acerta')
  near(wrapDelta(TEXTURE_WIDTH - 10 - 30), -40, 1e-9, 'wrapDelta pela menor volta')
  near(wrapX(2.7), 2.7 - 2 * (TEXTURE_WIDTH / 2 / PX_PER_UNIT), 1e-9, 'wrapX passa para o outro lado')
  const halfTurn = TEXTURE_WIDTH / 2 / PX_PER_UNIT
  const moved = movePatch({ ...m, x: halfTurn - 0.05, y: 0 }, 0.2 * PX_PER_UNIT, 0)
  assert(moved.x! < 0 && moved.x! > -halfTurn, 'arrastar além da costura continua do outro lado, sem prender')

  // --- mover: vertical usa o mapeamento real (inclui ombro) ---
  near(vToY(yToV(1.2)), 1.2, 1e-9, 'vToY inverte yToV na parede')
  near(vToY(yToV(1.85)), 1.85, 1e-6, 'vToY inverte yToV no ombro')
  const up = movePatch({ ...m, y: 0.5 }, 0, -0.3 * PX_PER_UNIT)
  near(up.y!, 0.8, 1e-3, 'arrastar 0,3 unidades para cima soma 0,3 em y')
  const custom = movePatch({ ...art, x: 0, y: 0 }, 0, -100)
  near(custom.y!, 100 / PX_PER_UNIT, 1e-9, 'custom artwork: y é deslocamento linear')

  // --- escala e rotação respeitam limites; texto leva a faixa junto ---
  near(scalePatch(m, 100).scale!, 2.5, 1e-9, 'escala do M limitada ao máximo dos controles DEV')
  near(scalePatch(m, 0.001).scale!, 0.2, 1e-9, 'escala do M limitada ao mínimo')
  const zero = find(collectInteractiveElements(state), 'zeroSugar')
  const zeroScaled = scalePatch(zero, 1.5)
  near(zeroScaled.scale!, zero.scale * 1.5, 1e-9, 'fontSize do Zero Sugar × 1,5')
  near(zeroScaled.background!.width, Math.min(2.6, zero.text!.background!.width * 1.5), 1e-9, 'a faixa acompanha a escala')
  assert(rotationPatch(m, 190).rotation === -170, 'rotação de arte fica em (−180, 180]')
  assert(rotationPatch({ ...m, kind: 'sticker' }, -30).rotation === 330, 'rotação de sticker fica em [0, 360)')

  // --- patches alteram os MESMOS estados, sem apagar o que não mencionam ---
  const a2 = patchArtwork(DEFAULT_ARTWORK, 'm', { x: 0.3, rotation: 20 })
  assert(a2.m.x === 0.3 && a2.m.rotation === 20 && a2.m.y === DEFAULT_ARTWORK.m.y && a2.m.scale === DEFAULT_ARTWORK.m.scale, 'patchArtwork parcial')
  const t2 = patchTexts(DEFAULT_TEXTS, 'zeroSugar', { scale: 0.2, background: { width: 2, height: 0.3, borderRadius: 0.02 } })
  assert(t2.zeroSugar.style.fontSize === 0.2 && t2.zeroSugar.background!.width === 2 && t2.zeroSugar.background!.color === '#1d1d1b', 'patchTexts (fontSize + faixa)')
  const s2 = patchStickers([sticker(0), sticker(1)], state.stickers[0]?.id ?? 'x', { x: 1 })
  assert(s2.length === 2, 'patchStickers mantém a lista')

  // --- UV ↔ composição: ida e volta, e a volta fecha na costura ---
  const layout: BodyUvLayout = {
    uStart: 0.0036,
    uEnd: 1.0041,
    columns: [
      { u: 0.0036, scale: 1.0005, offset: -0.0011 },
      { u: 0.5, scale: 0.9998, offset: 0.0006 },
      { u: 1.0041, scale: 1.0004, offset: 0.0014 },
    ],
  }
  for (const [x, y] of [[100, 900], [2048, 1500], [3900, 400], [10, 2500], [2047.5, 1000]]) {
    const { u, v } = compositionToUv(layout, x, y, TEXTURE_WIDTH, TEXTURE_HEIGHT)
    const back = uvToComposition(layout, u, v, TEXTURE_WIDTH, TEXTURE_HEIGHT)
    near(wrapDelta(back.x - x), 0, 1e-6, `ida e volta em x (${x})`)
    near(back.y, y, 1e-6, `ida e volta em y (${y})`)
  }
  near(uvToComposition(layout, layout.uStart, 0.5, TEXTURE_WIDTH, TEXTURE_HEIGHT).x, TEXTURE_WIDTH / 2, 1e-6, 'a costura do UV é o centro frontal')

  return { checks }
}
