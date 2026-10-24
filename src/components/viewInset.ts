/*
 * Recuo da área útil do palco 3D: quanto de cada borda está coberto pela interface (gaveta de edição, abas, barra de controles).
 * O EditorPanel e o ViewerControls escrevem aqui (em px); o CameraRig lê e desloca/encolhe o enquadramento para a lata ficar
 * centrada no que está realmente visível. É um módulo (e não estado do React) porque muda a cada quadro enquanto a gaveta é
 * arrastada, e isso não deve re-renderizar a árvore.
 */

export type ViewInset = { top: number; right: number; bottom: number; left: number }

const NONE: ViewInset = { top: 0, right: 0, bottom: 0, left: 0 }

// cada fonte (painel, barra) tem a sua parte; o recuo final é o maior de cada borda
const sources = new Map<string, ViewInset>()
const listeners = new Set<() => void>()
let current: ViewInset = NONE

function recompute() {
  const next = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const inset of sources.values()) {
    next.top = Math.max(next.top, inset.top)
    next.right = Math.max(next.right, inset.right)
    next.bottom = Math.max(next.bottom, inset.bottom)
    next.left = Math.max(next.left, inset.left)
  }
  if (next.top === current.top && next.right === current.right && next.bottom === current.bottom && next.left === current.left) return
  current = next
  for (const listener of listeners) listener()
}

export function setViewInset(source: string, inset: Partial<ViewInset> | null) {
  if (inset) sources.set(source, { ...NONE, ...inset })
  else sources.delete(source)
  recompute()
}

export const getViewInset = () => current

export function subscribeViewInset(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
