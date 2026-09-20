import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { BodyFill } from './canBodyFill'
import type { CustomArtwork } from './canCustomArtworkLayer'
import type { BodyUvLayout } from './canUvLayout'
import { createArtworkTarget, loadArtwork, paintArtwork, type ArtworkConfig } from './canArtwork'
import { releasePatternCache, type PatternConfig } from './canPattern'
import type { SugarConfig } from './canSugarLabel'
import type { Sticker } from './canStickers'
import { loadTextFonts, type TextsConfig } from './canText'

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
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const [target] = useState(() => createArtworkTarget(bodyFill, maxAnisotropy, uvLayout))

  useEffect(() => {
    let cancelled = false
    let frame = 0
    // A pintura só acontece com as fontes prontas (nunca desenha com fallback e troca depois). Sliders disparam muitas
    // alterações por frame: pintar no requestAnimationFrame e cancelar o anterior limita a uma repintura por frame.
    Promise.all([loadArtwork(artwork, pattern), loadTextFonts(texts)]).then(([loaded]) => {
      if (cancelled) return
      frame = requestAnimationFrame(() => paintArtwork(target, bodyFill, shoulderColor, pattern, customArtwork, stickers, artwork, loaded, texts, sugar))
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [target, bodyFill, shoulderColor, pattern, customArtwork, stickers, artwork, texts, sugar])

  useEffect(
    () => () => {
      target.texture.dispose()
      releasePatternCache()
    },
    [target],
  )

  return target.texture
}
