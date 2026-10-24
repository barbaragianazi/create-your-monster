import { DEFAULT_BODY_FILL, type BodyFill } from './canBodyFill'
import { DEFAULT_SHOULDER, type CanShoulderConfig } from './canShoulder'

// Acabamentos PBR: para novos (satin, chrome...) basta adicionar uma entrada
export const CAN_FINISHES = {
  metallic: { metalness: 0.85, roughness: 0.4 },
} satisfies Record<string, { metalness: number; roughness: number }>

export type CanFinish = keyof typeof CAN_FINISHES

// Regiões da lata e o nome do material correspondente no GLB.
// No GLB, tampa e fundo compartilham o Material.001; o fundo é separado em código (ver canModel.ts).
export const CAN_PARTS = {
  body: { label: 'Corpo da lata', materialName: 'Material.005' },
  top: { label: 'Parte superior', materialName: 'Material.001' },
  bottom: { label: 'Fundo da lata', materialName: 'Material.001.bottom' },
  seal: { label: 'Lacre', materialName: 'Material.006' },
} satisfies Record<string, { label: string; materialName: string }>

export type CanPart = keyof typeof CAN_PARTS

export type CanPartConfig = {
  color: string
  finish: CanFinish
}

/** Só o corpo tem preenchimento (sólido ou degradê, pintado na textura); as demais partes são cor sólida do material */
export type CanBodyConfig = {
  fill: BodyFill
  finish: CanFinish
}

export type CanColorPart = Exclude<CanPart, 'body'>

/** O ombro não está em CAN_PARTS: não tem material próprio, é uma região do corpo (ver canShoulder) */
export type CanConfig = { body: CanBodyConfig; shoulder: CanShoulderConfig } & Record<CanColorPart, CanPartConfig>

export const DEFAULT_CAN_CONFIG: CanConfig = {
  body: { fill: DEFAULT_BODY_FILL, finish: 'metallic' },
  shoulder: DEFAULT_SHOULDER,
  top: { color: '#e1e1e1', finish: 'metallic' },
  bottom: { color: '#e1e1e1', finish: 'metallic' },
  seal: { color: '#80e100', finish: 'metallic' },
}
