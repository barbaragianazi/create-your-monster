import type { FrontLabelNutrient, FrontLabelPlacement } from './canFrontLabel'

/** Um único estado para a rotulagem de açúcar: as opções são mutuamente exclusivas por construção */
export type SugarLabel = 'standard' | 'zero' | 'high-sugar'

export const SUGAR_LABEL_OPTIONS: readonly { id: SugarLabel; label: string }[] = [
  { id: 'standard', label: 'Padrão' },
  { id: 'zero', label: 'Zero Sugar' },
  { id: 'high-sugar', label: 'Alto em açúcar' },
]

export type SugarConfig = {
  type: SugarLabel
  /** posição/tamanho do selo de alto em açúcar; guardado mesmo quando outro tipo está ativo */
  highSugar: FrontLabelPlacement
}

export const DEFAULT_SUGAR: SugarConfig = {
  // preserva o visual atual da lata (Zero Sugar visível)
  type: 'zero',
  // canto superior direito da frente, no início do ombro, como na lata real
  highSugar: { scale: 1, x: 0.52, y: 1.51 },
}

type SugarOutput = {
  /** faixa de texto ZERO SUGAR */
  zeroSugar: boolean
  /** nutrientes do selo de rotulagem frontal */
  frontNutrients: readonly FrontLabelNutrient[]
}

// ÚNICA fonte da exclusividade: cada tipo declara tudo o que é exibido, então ZERO SUGAR e o selo de alto em açúcar
// nunca aparecem juntos. Quem desenha só lê esta tabela (nenhum outro lugar decide visibilidade).
const SUGAR_OUTPUT: Record<SugarLabel, SugarOutput> = {
  standard: { zeroSugar: false, frontNutrients: [] },
  zero: { zeroSugar: true, frontNutrients: [] },
  'high-sugar': { zeroSugar: false, frontNutrients: ['sugar'] },
}

export function resolveSugarLabel(type: SugarLabel): SugarOutput {
  return SUGAR_OUTPUT[type]
}
