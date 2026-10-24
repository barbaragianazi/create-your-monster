/**
 * Cursor único do app: seta de navegação (ponta arredondada no canto superior esquerdo e recorte côncavo atrás), em verde neon e
 * sem contorno. É o mesmo em todos os estados (parado, sobre partes clicáveis, arrastando). O SVG vira um data URI publicado como as
 * variáveis CSS --cursor-pointer, --cursor-grab e --cursor-grabbing (todas iguais, para o CSS continuar escolhendo por situação);
 * o cursor nativo de cada situação fica de fallback.
 */
const GREEN = '#80e100'

// contorno medido na referência (coordenadas do desenho original, ampliado pelo transform): borda esquerda vertical, ponta de cima
// arredondada, aresta de cima descendo para a asa direita, a asa volta quase na horizontal e o recorte desce em diagonal até a base
const PATH = "M31 47Q31 36 42 37L93 67Q101 72 99 78Q98 82 92 82L72 83Q64 84 60 90L46 110Q41 117 36 111Z"
// ponto do clique: a ponta da seta
const HOTSPOT: [number, number] = [4, 4]

function toCursor(fallback: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<path transform="translate(3.5 3.5) scale(0.333) translate(-31 -36)" d="${PATH}" fill="${GREEN}"/>` +
    `</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOTSPOT[0]} ${HOTSPOT[1]}, ${fallback}`
}

const root = document.documentElement.style
root.setProperty('--cursor-pointer', toCursor('pointer'))
root.setProperty('--cursor-grab', toCursor('grab'))
root.setProperty('--cursor-grabbing', toCursor('grabbing'))
