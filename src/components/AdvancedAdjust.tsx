import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

// "Ajustes avançados": controles de ajuste fino (posição, rotação...) que quase sempre se resolvem arrastando a lata. Ficam
// recolhidos para o painel mostrar só o essencial (cor, tamanho); o estado de aberto é por seção e não é guardado.
export default function AdvancedAdjust({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-800 pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-400 pointer-coarse:min-h-12"
      >
        Ajustes avançados
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  )
}
