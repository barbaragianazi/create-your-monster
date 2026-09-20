// Condensação é um efeito 3D independente da arte: não entra na CanvasTexture.
// Módulos: condensationSurface (raios contra os triângulos reais da lata) → condensationLayout (onde ficam as gotas,
// determinístico) → condensationRender (2 InstancedMesh + material). Este arquivo só guarda os parâmetros do efeito.

/** Parâmetros do efeito. Dado puro/serializável: um preset futuro (leve, gelada...) é só um Partial<CondensationConfig> */
export type CondensationConfig = {
  enabled: boolean
  /** 0–1: densidade global. Microgotas crescem quase linearmente; gotas maiores crescem menos (ficam raras) */
  amount: number
  /** multiplicador da escala geral; cada categoria responde de forma diferente (grandes crescem menos) */
  size: number
  /** 0–1: presença óptica (escurecimento nas bordas + reflexo). Nunca satura em branco */
  intensity: number
}

export const DEFAULT_CONDENSATION: CondensationConfig = {
  enabled: true,
  amount: 0.6,
  size: 1,
  intensity: 0.6,
}

export const CONDENSATION_LIMITS = {
  size: { min: 0.5, max: 1.75 },
} as const
