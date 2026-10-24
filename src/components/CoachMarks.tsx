import { Hand, MousePointerClick, Rotate3d, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { setViewInset } from './viewInset'
import { useIsTouch, useLayoutMode } from './useLayoutMode'

/*
 * Tutorial de primeiro uso no toque: três cartões curtos (girar, ampliar, editar), dispensáveis e lembrados no aparelho. No mouse quem
 * ensina é a dica do ViewerControls. O cartão fica na faixa do palco acima da gaveta e nunca bloqueia a lata (só o cartão recebe toque).
 */

const STORAGE_KEY = 'create-your-monster:coach-done'

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Rotate3d, title: 'Arraste para girar', text: 'Veja a lata por todos os lados.' },
  { icon: Hand, title: 'Pince para ampliar', text: 'Dois dedos aproximam ou afastam. Toque duas vezes para centralizar.' },
  { icon: MousePointerClick, title: 'Toque para editar', text: 'Toque numa parte da lata e o painel abre nos controles dela.' },
]

const alreadySeen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false // sem armazenamento (aba privada): mostra, mas só nesta sessão
  }
}

const remember = () => {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // sem armazenamento: o tutorial volta na próxima visita, sem prejuízo
  }
}

export default function CoachMarks() {
  const isTouch = useIsTouch()
  const mode = useLayoutMode()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(alreadySeen)
  const card = useRef<HTMLDivElement>(null)
  const visible = isTouch && !done

  // o cartão ocupa uma faixa do palco: a lata se enquadra no que sobra, em vez de ficar escondida atrás dele
  useEffect(() => {
    if (!visible) return
    const measure = () => {
      const height = card.current?.offsetHeight ?? 0
      setViewInset('coach', mode === 'landscape' ? null : { top: 64 + height + 8 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (card.current) observer.observe(card.current)
    return () => {
      observer.disconnect()
      setViewInset('coach', null)
    }
  }, [visible, mode, step])

  if (!visible) return null

  const finish = () => {
    remember()
    setDone(true)
  }
  const { icon: Icon, title, text } = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div
      ref={card}
      className={`pointer-events-none absolute z-20 flex justify-center px-4 ${
        mode === 'landscape' ? 'inset-y-0 left-[22rem] right-20 items-center' : 'inset-x-0 top-16'
      }`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          role="dialog"
          aria-label="Como usar"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.22 }}
          className="pointer-events-auto w-full max-w-sm border border-primary bg-black/90 p-3 backdrop-blur-sm"
          style={{ clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)' }}
        >
          <div className="flex items-start gap-3">
            <Icon aria-hidden size={26} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-monster text-2xl uppercase leading-none tracking-wide text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-300 [@media(max-height:640px)]:hidden">{text}</p>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <div aria-hidden className="flex gap-1.5">
              {STEPS.map((_, index) => (
                <span key={index} className={`h-1 w-5 ${index === step ? 'bg-primary' : 'bg-neutral-700'}`} />
              ))}
            </div>
            <div className="flex">
              <button type="button" onClick={finish} className="min-h-12 px-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 active:text-white">
                Pular
              </button>
              <button
                type="button"
                onClick={() => (last ? finish() : setStep(step + 1))}
                className="min-h-12 bg-primary px-5 text-[11px] font-bold uppercase tracking-widest text-black active:bg-white"
              >
                {last ? 'Entendi' : 'Próximo'}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
