import { forwardRef, useImperativeHandle, useRef } from 'react'
import { isCoarsePointer } from './useLayoutMode'

/*
 * Etiqueta que segue o ponteiro com o nome da parte da lata sob ele (lacre, corpo...). Como o contorno da seleção, é atualizada direto
 * no DOM pelo ElementInteraction (sem re-render do React). Posição em px relativos ao palco 3D.
 */

export type PartTagHandle = {
  /** hint: texto pequeno sob o nome (padrão: convida a clicar; no toque, a tocar) */
  show: (label: string, x: number, y: number, hint?: string) => void
  hide: () => void
}

const OFFSET = { x: 16, y: 18 }

const PartTag = forwardRef<PartTagHandle>(function PartTag(_, ref) {
  const element = useRef<HTMLDivElement>(null)
  const name = useRef<HTMLSpanElement>(null)
  const hintText = useRef<HTMLSpanElement>(null)

  useImperativeHandle(ref, () => ({
    show(label, x, y, hint = isCoarsePointer() ? 'toque para editar' : 'clique para editar') {
      const tag = element.current
      if (!tag || !name.current) return
      if (name.current.textContent !== label) name.current.textContent = label
      if (hintText.current && hintText.current.textContent !== hint) hintText.current.textContent = hint
      const parent = tag.parentElement
      // vira para o lado de dentro perto das bordas do palco
      const left = parent && x + OFFSET.x + tag.offsetWidth > parent.clientWidth ? x - OFFSET.x - tag.offsetWidth : x + OFFSET.x
      tag.style.transform = `translate(${Math.round(left)}px, ${Math.round(y + OFFSET.y)}px)`
      tag.style.opacity = '1'
    },
    hide() {
      if (element.current) element.current.style.opacity = '0'
    },
  }))

  return (
    <div
      ref={element}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-10 flex items-stretch border border-primary bg-black text-white transition-opacity duration-100"
      style={{ opacity: 0, clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)' }}
    >
      <span className="w-1 bg-primary" />
      <span className="flex flex-col px-2.5 py-1 leading-tight">
        <span ref={name} className="font-monster text-lg uppercase tracking-wide" />
        <span ref={hintText} className="text-[9px] uppercase tracking-widest text-primary" />
      </span>
    </div>
  )
})

export default PartTag
