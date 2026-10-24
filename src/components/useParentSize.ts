import { useEffect, useState, type RefObject } from 'react'

/** Tamanho (px) do elemento pai do elemento da ref, acompanhando redimensionamento e rotação do aparelho */
/** `watch`: qualquer valor que, ao mudar, indica que a ref passou a apontar para outro elemento */
export function useParentSize(ref: RefObject<HTMLElement | null>, watch?: unknown) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const measure = () => setSize((previous) => (previous.width === parent.clientWidth && previous.height === parent.clientHeight ? previous : { width: parent.clientWidth, height: parent.clientHeight }))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [ref, watch])
  return size
}
