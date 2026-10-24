import { useSyncExternalStore } from 'react'

/*
 * Modo de layout: decidido pela largura E pela altura (um celular em paisagem tem largura de tablet, mas só ~375px de altura, e o
 * layout de desktop não cabe nele).
 *
 *   desktop:   painel lateral à esquerda, barra de controles vertical à direita
 *   sheet:     celular em pé; abas embaixo e o painel vira uma gaveta (bottom sheet)
 *   landscape: celular deitado; painel lateral estreito e barra de controles compacta no topo
 */

export type LayoutMode = 'desktop' | 'sheet' | 'landscape'

const LANDSCAPE_SHORT = '(orientation: landscape) and (max-height: 520px)'
const WIDE = '(min-width: 768px)'
const COARSE = '(pointer: coarse)'

const subscribeTo = (queries: string[]) => (callback: () => void) => {
  const lists = queries.map((query) => window.matchMedia(query))
  for (const list of lists) list.addEventListener('change', callback)
  return () => {
    for (const list of lists) list.removeEventListener('change', callback)
  }
}

export const getLayoutMode = (): LayoutMode => {
  if (window.matchMedia(LANDSCAPE_SHORT).matches) return 'landscape'
  return window.matchMedia(WIDE).matches ? 'desktop' : 'sheet'
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribeTo([LANDSCAPE_SHORT, WIDE]), getLayoutMode, () => 'desktop')
}

/** O aparelho principal é de toque (dedo, sem hover) */
export const isCoarsePointer = () => typeof window !== 'undefined' && window.matchMedia(COARSE).matches

export function useIsTouch(): boolean {
  return useSyncExternalStore(subscribeTo([COARSE]), isCoarsePointer, () => false)
}

/** Vibração curta de confirmação (só onde existe: Android; o iOS ignora) */
export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // sem vibração: o feedback visual já basta
  }
}
