import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/*
 * Qualidade adaptativa: mede quanto cada quadro demora enquanto a lata está em movimento e, se a taxa fica baixa de forma
 * sustentada, desce um nível (menos pixels, depois menos gotas). Os níveis só voltam a subir depois de um bom tempo estável, e no
 * máximo duas vezes: nunca fica oscilando. O Canvas desenha sob demanda, então os intervalos longos (parado) são ignorados.
 *
 *   0: resolução até 1,5x · 1: resolução 1x · 2: resolução 1x e metade das gotas
 */

export type QualityLevel = 0 | 1 | 2

const WINDOW = 45 // quadros por amostra
const MAX_GAP_MS = 400 // intervalos maiores que isto são pausas (nada mudava), não quadros lentos
const SLOW_MS = 24 // média acima disto (< ~42 fps): desce
const FAST_MS = 18.5 // média abaixo disto (≈ 60 fps): pode subir
const WARMUP_MS = 4000 // compilação de shaders e texturas iniciais não contam
const UPGRADE_AFTER_MS = 15000
const MAX_UPGRADES = 2

export default function AdaptiveQuality({ level, onChange }: { level: QualityLevel; onChange: (level: QualityLevel) => void }) {
  const state = useRef({ last: 0, samples: [] as number[], startedAt: 0, stableSince: 0, upgrades: 0, level })
  useEffect(() => {
    state.current.level = level
    state.current.samples = []
    state.current.stableSince = performance.now()
  }, [level])

  useFrame(() => {
    const s = state.current
    const now = performance.now()
    if (!s.startedAt) s.startedAt = now
    const gap = now - s.last
    s.last = now
    if (now - s.startedAt < WARMUP_MS || document.hidden) return
    if (gap > MAX_GAP_MS) {
      s.samples = [] // retomou depois de uma pausa: recomeça a amostra
      return
    }
    s.samples.push(gap)
    if (s.samples.length < WINDOW) return

    const average = s.samples.reduce((sum, value) => sum + value, 0) / s.samples.length
    s.samples = []
    if (average > SLOW_MS && s.level < 2) {
      s.level = (s.level + 1) as QualityLevel
      s.stableSince = now
      console.info(`[qualidade] ${average.toFixed(1)} ms/quadro: nível ${s.level}`)
      onChange(s.level)
    } else if (average < FAST_MS && s.level > 0 && s.upgrades < MAX_UPGRADES && now - s.stableSince > UPGRADE_AFTER_MS) {
      s.level = (s.level - 1) as QualityLevel
      s.upgrades++
      s.stableSince = now
      console.info(`[qualidade] ${average.toFixed(1)} ms/quadro estável: volta ao nível ${s.level}`)
      onChange(s.level)
    }
  })

  return null
}
