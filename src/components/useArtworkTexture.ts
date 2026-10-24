import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { BodyFill } from './canBodyFill'
import type { CustomArtwork } from './canCustomArtworkLayer'
import type { BodyUvLayout } from './canUvLayout'
import { createArtworkTarget, loadArtwork, paintArtwork, presentArtwork, type ArtworkConfig } from './canArtwork'
import { releasePatternCache, type PatternConfig } from './canPattern'
import type { SugarConfig } from './canSugarLabel'
import type { Sticker } from './canStickers'
import { loadTextFonts, type TextsConfig } from './canText'

/** Duas mudanças com menos que isto entre si são uma rajada (slider, arraste): a GPU recebe a textura de prévia */
const BURST_MS = 350
/** Sem novas mudanças por este tempo, a textura plena é reprojetada e volta a ser usada */
const SETTLE_MS = 220

export function useArtworkTexture(
  bodyFill: BodyFill,
  shoulderColor: string | null,
  pattern: PatternConfig,
  customArtwork: CustomArtwork | null,
  stickers: readonly Sticker[],
  artwork: ArtworkConfig,
  texts: TextsConfig,
  sugar: SugarConfig,
  uvLayout: BodyUvLayout,
) {
  // 8x já resolve a lata vista de lado; acima disso o custo de amostragem cresce sem ganho visível
  const maxAnisotropy = useThree((state) => Math.min(8, state.gl.capabilities.getMaxAnisotropy()))
  const invalidate = useThree((state) => state.invalidate)
  const [target] = useState(() => createArtworkTarget(bodyFill, maxAnisotropy, uvLayout))
  // qual das duas texturas está na lata; só muda no começo e no fim de uma rajada
  const [usingPreview, setUsingPreview] = useState(false)
  const burst = useRef({ lastChangeAt: 0, settle: 0, preview: false })

  useEffect(() => {
    let cancelled = false
    let frame = 0
    // a rajada é medida entre as MUDANÇAS (não entre as pinturas): em máquina lenta as pinturas se espaçam e a prévia é justo a que ajuda
    const changedAt = performance.now()
    const inBurst = changedAt - burst.current.lastChangeAt < BURST_MS
    burst.current.lastChangeAt = changedAt
    // A pintura só acontece com as fontes prontas (nunca desenha com fallback e troca depois). Sliders disparam muitas
    // alterações por frame: pintar no requestAnimationFrame e cancelar o anterior limita a uma repintura por frame.
    Promise.all([loadArtwork(artwork, pattern), loadTextFonts(texts)]).then(([loaded]) => {
      if (cancelled) return
      frame = requestAnimationFrame(() => {
        const state = burst.current
        paintArtwork(target, bodyFill, shoulderColor, pattern, customArtwork, stickers, artwork, loaded, texts, sugar, inBurst ? 'preview' : 'full')

        window.clearTimeout(state.settle)
        if (inBurst) {
          if (!state.preview) {
            state.preview = true
            setUsingPreview(true)
          }
          state.settle = window.setTimeout(() => {
            presentArtwork(target, 'full')
            state.preview = false
            setUsingPreview(false)
            invalidate()
          }, SETTLE_MS)
        } else if (state.preview) {
          // pintou plena (sem rajada) enquanto a prévia estava na lata: a plena já está atualizada
          state.preview = false
          setUsingPreview(false)
        }
        invalidate() // o Canvas só desenha sob demanda: a textura nova precisa de um quadro
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [target, invalidate, bodyFill, shoulderColor, pattern, customArtwork, stickers, artwork, texts, sugar])

  useEffect(
    () => () => {
      window.clearTimeout(burst.current.settle)
      target.texture.dispose()
      target.preview.texture.dispose()
      releasePatternCache()
    },
    [target],
  )

  return usingPreview ? target.preview.texture : target.texture
}
