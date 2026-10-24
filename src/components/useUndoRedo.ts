import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * Desfazer/refazer sobre um "retrato" (snapshot) imutável de todo o estado editável. Os retratos só guardam referências (nada é
 * copiado), então o histórico é barato. Mudanças seguidas (arrastar um slider) viram UMA entrada: o retrato só é gravado quando
 * ficam COMMIT_MS sem mudar. Restaurar um retrato usa os mesmos setters do App; a mudança que isso causa não vira entrada nova
 * porque o retrato resultante é igual (campo a campo) ao que acabou de ser restaurado.
 */

const COMMIT_MS = 400
const LIMIT = 100

type History<T> = { committed: T; latest: T; past: T[]; future: T[]; timer: number }

function shallowEqual<T extends object>(a: T, b: T) {
  const keys = Object.keys(a) as (keyof T)[]
  return keys.every((key) => a[key] === b[key])
}

/** Grava já a mudança que ainda esperava o tempo de agrupamento; devolve se havia algo a gravar */
function commit<T extends object>(h: History<T>) {
  window.clearTimeout(h.timer)
  h.timer = 0
  if (shallowEqual(h.latest, h.committed)) return false
  h.past.push(h.committed)
  if (h.past.length > LIMIT) h.past.shift()
  h.committed = h.latest
  h.future = []
  return true
}

export function useUndoRedo<T extends object>(snapshot: T, restore: (value: T) => void) {
  const history = useRef<History<T>>({ committed: snapshot, latest: snapshot, past: [], future: [], timer: 0 })
  const restoreRef = useRef(restore)
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 })
  const sync = useCallback(() => setSizes({ undo: history.current.past.length, redo: history.current.future.length }), [])

  useEffect(() => {
    restoreRef.current = restore
  })

  useEffect(() => {
    const h = history.current
    h.latest = snapshot
    window.clearTimeout(h.timer)
    h.timer = 0
    if (shallowEqual(snapshot, h.committed)) return
    h.timer = window.setTimeout(() => {
      if (commit(h)) sync()
    }, COMMIT_MS)
  }, [snapshot, sync])

  useEffect(() => () => window.clearTimeout(history.current.timer), [])

  const undo = useCallback(() => {
    const h = history.current
    commit(h)
    const previous = h.past.pop()
    if (previous === undefined) return sync()
    h.future.push(h.committed)
    h.committed = previous
    restoreRef.current(previous)
    sync()
  }, [sync])

  const redo = useCallback(() => {
    const h = history.current
    commit(h)
    const next = h.future.pop()
    if (next === undefined) return sync()
    h.past.push(h.committed)
    h.committed = next
    restoreRef.current(next)
    sync()
  }, [sync])

  /** Troca tudo por `target` como uma ação que também pode ser desfeita (ex.: recomeçar) */
  const replace = useCallback(
    (target: T) => {
      const h = history.current
      commit(h)
      h.past.push(h.committed)
      if (h.past.length > LIMIT) h.past.shift()
      h.future = []
      h.committed = target
      restoreRef.current(target)
      sync()
    },
    [sync],
  )

  // Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Shift+Z e Ctrl+Y refazem. Em campos de texto vale o desfazer do próprio campo
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input[type=text], textarea, [contenteditable=true]')) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) undo()
      else if ((key === 'z' && event.shiftKey) || key === 'y') redo()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return { undo, redo, replace, canUndo: sizes.undo > 0, canRedo: sizes.redo > 0 }
}
