import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtworkConfig } from './canArtwork'
import type { CustomArtwork } from './canCustomArtworkLayer'
import { collectInteractiveElements } from './canInteraction'
import type { Sticker } from './canStickers'
import type { SugarConfig } from './canSugarLabel'
import { loadTextFonts, TEXT_ELEMENTS, type TextsConfig } from './canText'

/**
 * Bounds dos elementos editáveis, recalculados a partir dos MESMOS estados que a renderização lê (nada é guardado em separado).
 * A medida dos textos precisa das fontes carregadas: quando uma família/peso nova termina de carregar, os bounds são refeitos.
 */
export function useInteractiveElements(
  artwork: ArtworkConfig,
  texts: TextsConfig,
  sugar: SugarConfig,
  stickers: readonly Sticker[],
  customArtwork: CustomArtwork | null,
) {
  const fontKey = TEXT_ELEMENTS.map(({ id }) => `${texts[id].style.fontFamily}|${texts[id].style.fontWeight}`).join(',')
  const [readyFontKey, setReadyFontKey] = useState('')
  const latestTexts = useRef(texts)
  useEffect(() => {
    latestTexts.current = texts
  })

  useEffect(() => {
    let cancelled = false
    void loadTextFonts(latestTexts.current).then(() => {
      if (!cancelled) setReadyFontKey(fontKey)
    })
    return () => {
      cancelled = true
    }
    // as fontes só mudam com a chave; refazer a cada alteração de posição/tamanho seria à toa
  }, [fontKey])

  return useMemo(() => {
    void readyFontKey // recalcula quando as fontes ficam prontas (a medida dos textos depende delas)
    return collectInteractiveElements({ artwork, texts, sugar, stickers, customArtwork })
  }, [artwork, texts, sugar, stickers, customArtwork, readyFontKey])
}
