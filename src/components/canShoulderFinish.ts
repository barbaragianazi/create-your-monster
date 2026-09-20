import { CanvasTexture, RepeatWrapping, type MeshStandardMaterial } from 'three'
import { TEXTURE_HEIGHT, TEXTURE_WIDTH, WALL_TOP_Y, yToV } from './canArtwork'
import { CAN_FINISHES, type CanFinish } from './canMaterials'
import { projectToUv, uvTextureTransform, type BodyUvLayout } from './canUvLayout'
import { createCanvas } from './canvasUtils'

/*
 * Acabamento independente do ombro. O ombro e a parede são o MESMO mesh/material (Material.005), então o acabamento por região
 * vem de um mapa de rugosidade/metalicidade no mesmo espaço UV da textura de cor: a composição ideal (duas faixas horizontais,
 * ombro e resto) passa pelo mesmo projectToUv, então a fronteira cai exatamente sobre a mesma linha de vértices em que a cor
 * muda. Nada é alterado no GLB, no UV nem na geometria (a condensação lê a geometria e não é afetada).
 *
 * O mapa só é ligado ao material quando o acabamento do ombro difere do corpo; caso contrário o material fica exatamente como
 * antes (valores escalares, sem mapa). Metade da resolução da cor: um mapa de duas faixas não precisa de mais.
 */

const MAP_WIDTH = TEXTURE_WIDTH / 2
const MAP_HEIGHT = TEXTURE_HEIGHT / 2

export type ShoulderFinishTarget = {
  /** composição ideal: a lata desenrolada, duas faixas horizontais */
  canvas: HTMLCanvasElement
  /** reprojetada para o UV do GLB: o que a GPU lê */
  uvCanvas: HTMLCanvasElement
  uvLayout: BodyUvLayout
  texture: CanvasTexture
}

export function createShoulderFinishTarget(maxAnisotropy: number, uvLayout: BodyUvLayout): ShoulderFinishTarget {
  const canvas = createCanvas(MAP_WIDTH, MAP_HEIGHT)
  const uvCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT)

  // dados, não cor: fica em NoColorSpace (o padrão). Mesmo enquadramento horizontal/vertical da textura de cor
  const texture = new CanvasTexture(uvCanvas)
  texture.flipY = false
  texture.wrapS = RepeatWrapping
  const { repeat, offset } = uvTextureTransform(uvLayout, MAP_WIDTH)
  texture.repeat.x = repeat
  texture.offset.x = offset
  texture.anisotropy = maxAnisotropy

  return { canvas, uvCanvas, uvLayout, texture }
}

// glTF: rugosidade no canal G e metalicidade no B; o material multiplica o mapa por seus valores escalares
const channels = (roughness: number, metalness: number) => `rgb(0, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)})`

/** Pinta o mapa (valores relativos, 0..1, aos escalares do material): corpo em tudo, ombro na faixa acima da parede */
function paintFinishMap(
  { canvas, uvCanvas, uvLayout, texture }: ShoulderFinishTarget,
  body: { roughness: number; metalness: number },
  shoulder: { roughness: number; metalness: number },
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = channels(body.roughness, body.metalness)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = channels(shoulder.roughness, shoulder.metalness)
  ctx.fillRect(0, 0, canvas.width, yToV(WALL_TOP_Y) * canvas.height)

  projectToUv(canvas, uvCanvas, uvLayout)
  texture.needsUpdate = true
}

/**
 * Aplica ao material do corpo o acabamento do corpo e, se for diferente, o do ombro. Iguais: valores escalares e sem mapa (o
 * comportamento de antes). Diferentes: os escalares viram o maior de cada par e o mapa guarda a razão de cada região, então
 * as duas regiões têm exatamente os valores de CAN_FINISHES (o maior de cada par cai em 255).
 */
export function applyBodyFinish(
  material: MeshStandardMaterial,
  target: ShoulderFinishTarget,
  bodyFinish: CanFinish,
  shoulderFinish: CanFinish,
) {
  const body = CAN_FINISHES[bodyFinish]
  const shoulder = CAN_FINISHES[shoulderFinish]
  const split = bodyFinish !== shoulderFinish

  if (split) {
    const metalness = Math.max(body.metalness, shoulder.metalness) || 1
    const roughness = Math.max(body.roughness, shoulder.roughness) || 1
    material.setValues({ metalness, roughness })
    paintFinishMap(
      target,
      { roughness: body.roughness / roughness, metalness: body.metalness / metalness },
      { roughness: shoulder.roughness / roughness, metalness: shoulder.metalness / metalness },
    )
  } else {
    material.setValues(body)
  }

  // trocar o mapa recompila o shader: só quando ele liga/desliga
  const map = split ? target.texture : null
  if (material.metalnessMap !== map) {
    material.metalnessMap = map
    material.roughnessMap = map
    material.needsUpdate = true
  }
}
