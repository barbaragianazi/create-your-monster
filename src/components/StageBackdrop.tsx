import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import clawUrl from '../assets/branding/monster-m-clean.svg'
import { useLayoutMode } from './useLayoutMode'
import { GRAIN_URI, paintBackdrop, type BackdropColors, type BackdropId } from './stageBackdrops'

/*
 * Fundo do palco da lata: tudo estático (CSS/SVG), por trás do canvas transparente, então não custa nada por quadro.
 * Camadas, de baixo para cima: preto → cortes diagonais → garras gigantes quase invisíveis → halo na cor da lata →
 * luz de cima + brilho verde no chão → vinheta → grão.
 */

const GRAIN = `url("${GRAIN_URI}")`

// Parallax: o mouse desloca as camadas em profundidades diferentes (as garras mais que as lâminas). Só atualiza duas variáveis CSS por
// quadro; nada é redesenhado no 3D. Desligado com "reduzir movimento".
const DEPTH = { blades: '12px 8px', clawLeft: '-34px -22px' }
const shift = (depth: string) => `calc(var(--px, 0) * ${depth.split(' ')[0]}) calc(var(--py, 0) * ${depth.split(' ')[1]})`

function MonsterBackdrop({ glowColor }: { glowColor: string }) {
  const root = useRef<HTMLDivElement>(null)
  // No celular o palco é pequeno: lâminas, garras gigantes e grão viram manchas que competem com a lata. Ficam só halo, luz e vinheta.
  const simple = useLayoutMode() !== 'desktop'
  useEffect(() => {
    // no toque o ponteiro é o dedo arrastando a lata (não um "olhar" sobre o palco), e o parallax só gastaria bateria
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        root.current?.style.setProperty('--px', (event.clientX / window.innerWidth - 0.5).toFixed(3))
        root.current?.style.setProperty('--py', (event.clientY / window.innerHeight - 0.5).toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div ref={root} aria-hidden className="absolute inset-0 overflow-hidden bg-[#0a0a0a]">
      {/* cortes diagonais: lâminas cinza-escuro cruzando o palco, como os cantos cortados do painel */}
      {!simple && (
      <svg
        className="absolute -inset-[3%] h-[106%] w-[106%] transition-[translate] duration-500 ease-out"
        style={{ translate: shift(DEPTH.blades) }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polygon points="76,0 100,0 100,100 94,100" fill="#111" />
        <polygon points="68,0 74,0 92,100 86,100" fill="#0e0e0e" />
        <polygon points="63,0 66,0 84,100 81,100" fill={glowColor} opacity="0.08" />
      </svg>
      )}

      {/* garra gigante e apagada à esquerda; os riscos diagonais ficam à direita, balanceando a composição */}
      <img
        src={clawUrl}
        alt=""
        className={`absolute -rotate-12 transition-[translate] duration-700 ease-out ${
          simple ? '-left-[14%] top-[6%] h-[72%] opacity-[0.05]' : '-left-[6%] top-[4%] h-[110%] opacity-[0.035]'
        }`}
        style={{ translate: shift(DEPTH.clawLeft) }}
        draggable={false}
      />

      {/* halo: assume a cor do corpo da lata */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 38% 46% at 50% 52%, color-mix(in oklab, ${glowColor} 22%, transparent), transparent 70%)`,
        }}
      />
      {/* luz de cima e brilho verde no chão */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 30% 40% at 50% 8%, rgb(255 255 255 / 0.09), transparent 70%), radial-gradient(ellipse 34% 14% at 50% 90%, color-mix(in oklab,${glowColor} 14%, transparent), transparent 75%)`,
        }}
      />
      {/* vinheta */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 50%, transparent 45%, rgb(0 0 0 / 0.7) 100%)' }}
      />
      {/* grão */}
      {!simple && <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />}
    </div>
  )
}

/** Os outros fundos são um canvas pintado pelo mesmo pintor da exportação (repinta ao redimensionar); também serve às miniaturas */
export function BackdropCanvas({ id, colors, className }: { id: BackdropId; colors: BackdropColors; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { glow, floor, image } = colors
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const paint = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || width === 0 || height === 0) return
      canvas.width = width
      canvas.height = height
      paintBackdrop(ctx, width, height, id, { glow, floor, image }).catch(() => {})
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [id, glow, floor, image])
  return <canvas ref={ref} aria-hidden className={className ?? 'absolute inset-0 h-full w-full'} />
}

export default function StageBackdrop({ backdrop, glowColor, floorColor, image }: { backdrop: BackdropId; glowColor: string; floorColor: string; image: string | null }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
      {/* a troca é um fade cruzado: o fundo que sai continua visível enquanto o novo aparece */}
      <AnimatePresence initial={false}>
        <motion.div
          key={backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          {backdrop === 'monster' ? (
            <MonsterBackdrop glowColor={glowColor} />
          ) : (
            <BackdropCanvas id={backdrop} colors={{ glow: glowColor, floor: floorColor, image }} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
