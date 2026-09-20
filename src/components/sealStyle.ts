// Personalização do lacre: estilo (padrão ou com o furo do dedo preenchido) e o Monster M sobre a superfície preenchida.
// Cor e acabamento da superfície NÃO têm controle próprio: ela usa o mesmo material do lacre (ver sealCap).

export type SealStyle = 'standard' | 'custom'
export type LogoColorMode = 'auto' | 'manual'

export type SealLogoConfig = {
  enabled: boolean
  colorMode: LogoColorMode
  /** última cor manual: preservada ao alternar Automática ↔ Manual */
  manualColor: string
}

export type SealCustomization = {
  style: SealStyle
  logo: SealLogoConfig
}

export const DEFAULT_SEAL_CUSTOMIZATION: SealCustomization = {
  style: 'standard',
  logo: { enabled: true, colorMode: 'auto', manualColor: '#000000' },
}

export const SEAL_STYLE_OPTIONS: readonly { id: SealStyle; label: string }[] = [
  { id: 'standard', label: 'Padrão' },
  { id: 'custom', label: 'Personalizado' },
]

export const LOGO_COLOR_MODE_OPTIONS: readonly { id: LogoColorMode; label: string }[] = [
  { id: 'auto', label: 'Automática' },
  { id: 'manual', label: 'Manual' },
]

// --- Cor automática do logo ---------------------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '')
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6)
  const value = Number.parseInt(full, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/**
 * Luminância relativa (0 = preto, 1 = branco) de uma cor sRGB: cada canal é linearizado (a curva sRGB, não uma média
 * simples dos canais) e ponderado pela sensibilidade do olho (0,2126 R + 0,7152 G + 0,0722 B).
 */
export function relativeLuminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste WCAG entre duas luminâncias (1 a 21) */
export function contrastRatio(a: number, b: number) {
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/** Preto ou branco, o que tiver MAIOR razão de contraste com a cor do lacre (empate → preto) */
export function autoLogoColor(sealColor: string): '#000000' | '#ffffff' {
  const luminance = relativeLuminance(sealColor)
  return contrastRatio(luminance, 0) >= contrastRatio(luminance, 1) ? '#000000' : '#ffffff'
}

/** Cor efetiva do M: automática (contraste com o lacre) ou a última cor manual escolhida */
export function resolveLogoColor(sealColor: string, logo: SealLogoConfig) {
  return logo.colorMode === 'auto' ? autoLogoColor(sealColor) : logo.manualColor
}
