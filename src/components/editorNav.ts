import { BadgeCheck, Cylinder, Download, Droplets, ImagePlus, Type, type LucideIcon } from 'lucide-react'
import { ARTWORK_ELEMENTS } from './canArtwork'
import { stickerIdOf } from './canInteraction'
import { TEXT_ELEMENTS } from './canText'

/*
 * Navegação do painel de edição: os grupos (coluna de ícones e passos do cabeçalho) e o que está aberto. O estado fica no App porque
 * quem muda a navegação não é só o painel: o cabeçalho e a seleção de elementos na lata também abrem grupos e seções.
 */

export type GroupId = 'can' | 'identity' | 'text' | 'custom' | 'effects' | 'export'

export const GROUPS: { id: GroupId; label: string; /** rótulo curto das abas estreitas do celular */ shortLabel?: string; icon: LucideIcon }[] = [
  { id: 'can', label: 'Lata', icon: Cylinder },
  { id: 'identity', label: 'Identidade', icon: BadgeCheck },
  { id: 'text', label: 'Textos', icon: Type },
  { id: 'custom', label: 'Personalizar', shortLabel: 'Custom', icon: ImagePlus },
  { id: 'effects', label: 'Efeitos', icon: Droplets },
  { id: 'export', label: 'Exportar', icon: Download },
]

export type PanelState = {
  group: GroupId
  /** seção aberta (uma por vez); null = todas fechadas */
  section: string | null
  collapsed: boolean
}

/** Seção que abre junto com o grupo: a primeira, para convidar o usuário a interagir com ela e com as demais */
export const FIRST_SECTION: Record<GroupId, string> = {
  can: 'body',
  identity: ARTWORK_ELEMENTS[0].id,
  text: TEXT_ELEMENTS.find(({ id }) => id !== 'zeroSugar')?.id ?? 'sugar',
  custom: 'pattern',
  effects: 'condensation',
  export: 'download', // o botão de baixar já fica à vista ao abrir a aba
}

export const INITIAL_PANEL: PanelState = { group: 'can', section: FIRST_SECTION.can, collapsed: false }

/** Abre o grupo (sempre aberto, na primeira seção) */
export const showGroup = (group: GroupId): PanelState => ({ group, section: FIRST_SECTION[group], collapsed: false })

/** Onde fica o controle de cada elemento selecionável na lata */
export function locate(elementId: string): { group: GroupId; section: string } | null {
  if (ARTWORK_ELEMENTS.some((element) => element.id === elementId)) return { group: 'identity', section: elementId }
  if (elementId === 'flavor') return { group: 'text', section: 'flavor' }
  if (elementId === 'zeroSugar') return { group: 'text', section: 'sugar' }
  if (elementId === 'customArtwork') return { group: 'custom', section: 'customArtwork' }
  if (stickerIdOf(elementId)) return { group: 'custom', section: 'stickers' }
  return null
}
