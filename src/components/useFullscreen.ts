import { useCallback, useEffect, useState } from 'react'

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> }
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }

const doc = document as FullscreenDocument

const isActive = () => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)

/**
 * Tela cheia do navegador (o "F11" do celular). `supported` é falso onde a API não existe — o iPhone, por exemplo, só libera
 * tela cheia para vídeo —, e o botão deve sumir nesses casos. O estado acompanha o evento, porque o usuário também sai pelo
 * gesto/botão voltar do sistema.
 */
export function useFullscreen() {
  const root = document.documentElement as FullscreenElement
  const supported = Boolean(root.requestFullscreen ?? root.webkitRequestFullscreen)
  const [active, setActive] = useState(isActive)

  useEffect(() => {
    const sync = () => setActive(isActive())
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggle = useCallback(() => {
    // o navegador pode recusar (política da página, modo imersivo indisponível): sem tela cheia o app segue normal
    const run = isActive()
      ? (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      : (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.())
    run?.catch(() => {})
  }, [root])

  return { supported, active, toggle }
}
