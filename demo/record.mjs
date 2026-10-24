// Grava um vídeo de demonstração do Create Your Monster usando o site como um usuário (Playwright).
// Uso: com o `npm run dev` rodando, `node record.mjs [url]`. Saída: demo/output/create-your-monster-demo.webm
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'

const SITE = process.argv[2] ?? 'http://localhost:5173/'
const SIZE = { width: 1280, height: 720 }
const OUT = fileURLToPath(new URL('./output/', import.meta.url))
const TMP = OUT + 'tmp/'
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: TMP, size: SIZE } })

// Cursor visível (o vídeo do Playwright não grava o ponteiro) com um anel ao clicar
await context.addInitScript(() => {
  const start = () => {
    const cursor = document.createElement('div')
    cursor.style.cssText =
      'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);' +
      "background:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><path d='M3 2l14 8-6 1.8L8.5 18z' fill='white' stroke='black' stroke-width='1.4' stroke-linejoin='round'/></svg>\") no-repeat"
    document.body.append(cursor)
    addEventListener('mousemove', (e) => (cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`), true)
    addEventListener(
      'mousedown',
      (e) => {
        const ring = document.createElement('div')
        ring.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border:2px solid #80e100;border-radius:50%;z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out`
        document.body.append(ring)
        requestAnimationFrame(() => ((ring.style.transform = 'scale(1.8)'), (ring.style.opacity = '0')))
        setTimeout(() => ring.remove(), 500)
      },
      true,
    )
  }
  if (document.body) start()
  else addEventListener('DOMContentLoaded', start)
})

const page = await context.newPage()
const wait = (ms) => page.waitForTimeout(ms)
let pos = { x: SIZE.width / 2, y: SIZE.height / 2 }
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// Movimento por TEMPO REAL (não por número de passos): cada chamada ao navegador leva alguns ms, e contar passos esticaria o gesto
// e deixaria o cursor travado. Assim a duração é a combinada e só a quantidade de quadros muda.
async function glide(x, y, ms) {
  const from = pos
  const t0 = Date.now()
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms)
    const e = ease(t)
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
    if (t >= 1) break
  }
  pos = { x, y }
}
const moveTo = (x, y, ms = 600) => glide(x, y, ms)
async function center(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('elemento sem caixa: ' + locator)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
async function click(locator, ms = 600) {
  const c = await center(locator)
  await moveTo(c.x, c.y, ms)
  await page.mouse.down()
  await wait(70)
  await page.mouse.up()
  await wait(300)
}
// arrasta sobre a lata (gira a câmera)
async function drag(dx, dy = 0, ms = 1200) {
  await page.mouse.down()
  await glide(pos.x + dx, pos.y + dy, ms)
  await page.mouse.up()
}
// muda um <input type=color> como o seletor faria: cursor até a amostra, clique e a cor muda
async function pickColor(locator, hex) {
  await click(locator)
  await locator.fill(hex)
  await wait(700)
}
// anima um slider do valor atual até o alvo (também em tempo real)
async function slide(locator, to, ms = 650) {
  const c = await center(locator)
  await moveTo(c.x, c.y, 500)
  await locator.evaluate(
    (el, { to, ms }) =>
      new Promise((resolve) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        const from = Number(el.value)
        const t0 = performance.now()
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / ms)
          set.call(el, String(from + (to - from) * t))
          el.dispatchEvent(new Event('input', { bubbles: true }))
          t < 1 ? requestAnimationFrame(tick) : resolve()
        }
        requestAnimationFrame(tick)
      }),
    { to, ms },
  )
  await wait(250)
}
// clica num botão que abre o seletor de arquivos e escolhe o arquivo
async function upload(locator, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click(locator)])
  await chooser.setFiles(fileURLToPath(new URL('./assets/' + file, import.meta.url)))
  await wait(1200)
}
const tab = (name) => page.getByRole('button', { name, exact: true }).first()
const section = (title) => page.locator('h3 button', { hasText: title })

// --- Roteiro ------------------------------------------------------------------------------------------------------
await page.goto(SITE)
await page.waitForSelector('canvas')
await wait(3000)

// 1. Gira a lata arrastando e mostra o hover da arte
await moveTo(780, 400, 700)
await drag(-220, 0, 1200)
await drag(220, 0, 1200)
await moveTo(600, 400, 700)
await wait(1400)

// 2. LATA: cor do corpo
await pickColor(page.locator('input[type=color]').first(), '#101018')

// 3. IDENTIDADE: cor e tamanho do M
await click(tab('Identidade'))
await wait(500)
await pickColor(page.locator('input[type=color]').first(), '#ff2d95')
await slide(page.locator('input[type=range]').first(), 1.05)

// 4. TEXTOS: nome do sabor e cor
await click(tab('Textos'))
await wait(500)
const flavor = page.locator('input[type=text]').first()
await click(flavor)
await flavor.press('Control+A')
await page.keyboard.type('BERRY BLAST', { delay: 90 })
await wait(300)
await pickColor(page.locator('input[type=color]').first(), '#ff9ac9')

// 5. PERSONALIZAR: stickers
await click(tab('Personalizar'))
await wait(500)
await click(section('Stickers'))
await wait(500)
const stickerRanges = page.locator('#section-stickers input[type=range]')
await upload(page.locator('#section-stickers button', { hasText: 'Adicionar sticker' }), 'sticker-bolt.svg')
await slide(stickerRanges.nth(0), -0.62) // posição X
await slide(stickerRanges.nth(1), 0.05) // posição Y
await slide(stickerRanges.nth(2), 1.5) // escala
await slide(stickerRanges.nth(3), 18) // rotação
await upload(page.locator('#section-stickers button', { hasText: 'Adicionar sticker' }), 'sticker-star.svg')
await slide(stickerRanges.nth(0), 0.6)
await slide(stickerRanges.nth(1), 0.25)
await slide(stickerRanges.nth(3), -12)

// 6. EFEITOS: condensação
await click(tab('Efeitos'))
await wait(500)
await slide(page.locator('input[type=range]').first(), 1, 800)

// 7. Gira para mostrar os stickers
await moveTo(900, 420, 600)
await drag(-300, 0, 1200)
await drag(300, 0, 1200)

// 8. EXPORTAR: fundos prontos e fundo personalizado
await click(tab('Exportar'))
await wait(600)
for (const name of ['Neon', 'Grade', 'Raios', 'Estúdio']) {
  await click(page.getByRole('button', { name: new RegExp(name, 'i') }).first(), 500)
  await wait(600)
}
await upload(page.getByRole('button', { name: /fundo personalizado/i }), 'background.svg')
await wait(800)

// 9. Exporta a imagem
await click(section('Exportar imagem'))
await wait(500)
await click(page.getByRole('button', { name: /16:9/ }), 500)
const [download] = await Promise.all([page.waitForEvent('download'), click(page.getByRole('button', { name: /baixar png/i }))])
await download.saveAs(OUT + 'exportacao.png')
await wait(1500)

// 10. Fecha o painel e mostra o resultado
await click(page.getByRole('button', { name: 'Fechar painel' }))
await wait(500)
await moveTo(900, 480, 600)
await drag(-380, 0, 1400)
await drag(380, 0, 1400)
await page.mouse.wheel(0, -500)
await wait(1500)
await moveTo(1000, 620, 600)
await wait(1000)

await context.close()
await browser.close()
const file = readdirSync(TMP).find((name) => name.endsWith('.webm'))
renameSync(TMP + file, OUT + 'create-your-monster-demo.webm')
rmSync(TMP, { recursive: true, force: true })
console.log('Vídeo salvo em', OUT + 'create-your-monster-demo.webm')
