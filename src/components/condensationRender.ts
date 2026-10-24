import {
  AddEquation,
  CustomBlending,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshPhysicalMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  SphereGeometry,
  type Object3D,
} from 'three'
import { DEFAULT_CONDENSATION } from './canCondensation'
import { DROP_FIELD, DROP_STRIDE, MACRO_QUOTA, MICRO_QUOTA, visibleCount, type CondensationLayout, type DropGroup } from './condensationLayout'
import { pointInPolygon, type Vec2 } from './sealPolygon'

// Duas malhas instanciadas (2 draw calls no total): microgotas (geometria mínima) e gotas maiores.
// Todas compartilham a lógica de material; nada é recriado ao mexer nos sliders.

const EMBED = 0.4 // fração da altura do elipsoide enterrada na lata: esconde a base e evita z-fighting
const CAP_ANGLE = Math.PI * 0.46 // calota até um pouco além do plano da superfície, para existir a parte enterrada
const MAX_SEMI_AXIS = { a: 0.06, b: 0.11 } // limite duro depois do slider Tamanho: nada vira "bolha"

// Contorno irregular: cada instância deforma o raio da calota com 2 harmônicas (aShape). O elipsoide deixa de ser óbvio
const VERTEX_WOBBLE = /* glsl */ `#include <begin_vertex>
  float wobbleAngle = atan(position.y, position.x + 1e-5);
  transformed.xy *= 1.0 + aShape.x * cos(2.0 * wobbleAngle + aShape.z) + aShape.y * cos(3.0 * wobbleAngle + aShape.w);`

// Água sobre alumínio, sem "bolinha de vidro":
// - a cor difusa é preta: o que sobra do PBR é só reflexo especular (Fresnel + ambiente + luzes);
// - o reflexo passa por um limitador suave, então NUNCA estoura para branco nem desenha um contorno branco;
// - o alpha só escurece a arte por baixo (mais nas bordas, como uma lente d'água), e a arte segue visível;
// - o brilho depende do ângulo da luz/câmera (reflexo real), então as gotas "acendem" conforme a lata gira.
// Blending "src + dst·(1−a)": o reflexo não é enfraquecido pelo alpha. Sem `transmission` (re-renderizaria a cena).
const FRAGMENT_OPTICS = /* glsl */ `#include <opaque_fragment>
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float edge = 1.0 - ndv;
  float presence = uIntensity * 1.6;
  vec3 specular = gl_FragColor.rgb * (uSpecular * presence);
  specular /= 1.0 + specular * 2.4;
  gl_FragColor.rgb = specular;
  gl_FragColor.a = clamp(presence * uAbsorb * (0.15 + 0.85 * pow(edge, 1.2)), 0.0, 0.85);`

type Uniform = { value: number }

function createMaterial(intensity: Uniform, specular: number, absorb: number) {
  const material = new MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.14,
    ior: 1.4,
    envMapIntensity: 0.7,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  })
  // uSpecular / uAbsorb são por material: as microgotas brilham menos que as maiores
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIntensity = intensity
    shader.uniforms.uSpecular = { value: specular }
    shader.uniforms.uAbsorb = { value: absorb }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aShape;')
      .replace('#include <begin_vertex>', VERTEX_WOBBLE)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uIntensity;\nuniform float uSpecular;\nuniform float uAbsorb;')
      .replace('#include <opaque_fragment>', FRAGMENT_OPTICS)
  }
  material.customProgramCacheKey = () => 'condensation-v2'
  return material
}

function createMesh(segments: number, rings: number, capacity: number, material: MeshPhysicalMaterial, name: string) {
  const geometry = new SphereGeometry(1, segments, rings, 0, Math.PI * 2, 0, CAP_ANGLE).rotateX(Math.PI / 2)
  geometry.setAttribute('aShape', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4))

  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.name = name
  mesh.count = 0
  mesh.renderOrder = 1
  // Efeito puramente visual: não recebe raycast (cliques, hover e seleção passam direto para a lata)
  mesh.raycast = () => undefined
  // A lata nunca sai do enquadramento: dispensa o bounding sphere de milhares de instâncias
  mesh.frustumCulled = false
  return mesh
}

// Escreve as matrizes direto no array da instância (sem alocar). Cada gota é um elipsoide com +Z na normal da superfície,
// +Y na tangente "para cima" e +X na tangente restante; o perfil é baixo (achatado), aderido ao alumínio.
// `hidden` marca gotas escondidas sob a superfície do lacre personalizado: viram instâncias degeneradas (escala 0)
function writeMatrices(mesh: InstancedMesh, group: DropGroup, size: number, hidden: Uint8Array | null) {
  const out = mesh.instanceMatrix.array as Float32Array
  const d = group.data

  for (let i = 0; i < group.count; i++) {
    const o = i * DROP_STRIDE
    if (hidden?.[i]) {
      out.fill(0, i * 16, i * 16 + 16)
      out[i * 16 + 15] = 1
      continue
    }
    const scale = Math.pow(size, d[o + DROP_FIELD.sizeExp])
    const a = Math.min(MAX_SEMI_AXIS.a, d[o + DROP_FIELD.a] * scale)
    const b = Math.min(MAX_SEMI_AXIS.b, d[o + DROP_FIELD.b] * scale)
    const c = d[o + DROP_FIELD.flat] * Math.min(a, b)

    const nx = d[o + DROP_FIELD.nx]
    const ny = d[o + DROP_FIELD.ny]
    const nz = d[o + DROP_FIELD.nz]
    const ux = d[o + DROP_FIELD.ux]
    const uy = d[o + DROP_FIELD.uy]
    const uz = d[o + DROP_FIELD.uz]
    // X = u × n (sistema destro)
    const tx = uy * nz - uz * ny
    const ty = uz * nx - ux * nz
    const tz = ux * ny - uy * nx

    const rot = d[o + DROP_FIELD.rot]
    const cr = Math.cos(rot)
    const sr = Math.sin(rot)

    // as facetas e a curvatura afastam o triângulo do resto da gota: enterra um pouco mais para a borda não flutuar
    const embed = EMBED * c + Math.min(0.3 * c, d[o + DROP_FIELD.embed] * Math.max(a, b))

    const m = i * 16
    out[m] = (tx * cr + ux * sr) * a
    out[m + 1] = (ty * cr + uy * sr) * a
    out[m + 2] = (tz * cr + uz * sr) * a
    out[m + 3] = 0
    out[m + 4] = (-tx * sr + ux * cr) * b
    out[m + 5] = (-ty * sr + uy * cr) * b
    out[m + 6] = (-tz * sr + uz * cr) * b
    out[m + 7] = 0
    out[m + 8] = nx * c
    out[m + 9] = ny * c
    out[m + 10] = nz * c
    out[m + 11] = 0
    out[m + 12] = d[o + DROP_FIELD.px] - nx * embed
    out[m + 13] = d[o + DROP_FIELD.py] - ny * embed
    out[m + 14] = d[o + DROP_FIELD.pz] - nz * embed
    out[m + 15] = 1
  }

  mesh.instanceMatrix.needsUpdate = true
}

// Só as gotas da TAMPA (normal para cima) cujo centro cai dentro do polígono ficam sob a superfície do lacre
function coveredDrops(group: DropGroup, polygon: readonly Vec2[]) {
  const mask = new Uint8Array(group.count)
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  for (let i = 0; i < group.count; i++) {
    const o = i * DROP_STRIDE
    if (group.data[o + DROP_FIELD.ny] < 0.6) continue
    const x = group.data[o + DROP_FIELD.px]
    const z = group.data[o + DROP_FIELD.pz]
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && pointInPolygon(x, z, polygon)) mask[i] = 1
  }
  return mask
}

export type CondensationLayer = {
  /** Grupo com as duas malhas; vai como filho do nó da lata (mesmo espaço local dos meshes do GLB) */
  root: Group
  attachTo: (host: Object3D) => () => void
  /** Sobe o layout para a GPU (uma vez por lata) */
  setLayout: (layout: CondensationLayout) => void
  setSize: (layout: CondensationLayout, size: number) => void
  /** Esconde as gotas da tampa que ficariam sob a superfície do lacre personalizado (polígono xz no espaço da lata); null = todas visíveis. Não muda o layout. Devolve quantas ficaram escondidas */
  setCoveredRegion: (layout: CondensationLayout, polygon: readonly Vec2[] | null) => number
  setAmount: (layout: CondensationLayout, amount: number, enabled: boolean) => void
  /** Só atualiza um uniform do shader: não recompila nem recria nada */
  setIntensity: (intensity: number) => void
  /** Esconde as ~14 mil microgotas (por ora, enquanto a câmera se mexe): é o que mais pesa na GPU e quase não aparece em movimento */
  setSimplified: (simplified: boolean) => void
  dispose: () => void
}

export function createCondensationLayer(): CondensationLayer {
  const intensity: Uniform = { value: DEFAULT_CONDENSATION.intensity }
  const microMaterial = createMaterial(intensity, 0.8, 0.6)
  const macroMaterial = createMaterial(intensity, 1, 0.55)
  const micro = createMesh(8, 2, MICRO_QUOTA, microMaterial, 'condensation-micro')
  const macro = createMesh(10, 4, MACRO_QUOTA, macroMaterial, 'condensation-macro')

  const root = new Group()
  root.name = 'condensation'
  root.add(micro, macro)

  let currentSize = DEFAULT_CONDENSATION.size
  let enabledNow = false
  let simplified = false
  const updateMicroVisibility = () => {
    micro.visible = enabledNow && micro.count > 0 && !simplified
  }
  let hiddenMicro: Uint8Array | null = null
  let hiddenMacro: Uint8Array | null = null
  const write = (layout: CondensationLayout) => {
    writeMatrices(micro, layout.micro, currentSize, hiddenMicro)
    writeMatrices(macro, layout.macro, currentSize, hiddenMacro)
  }

  const upload = (mesh: InstancedMesh, group: DropGroup) => {
    const attribute = mesh.geometry.getAttribute('aShape') as InstancedBufferAttribute
    ;(attribute.array as Float32Array).set(group.shape)
    attribute.needsUpdate = true
  }

  return {
    root,
    attachTo: (host) => {
      host.add(root)
      return () => {
        host.remove(root)
      }
    },
    setLayout: (layout) => {
      upload(micro, layout.micro)
      upload(macro, layout.macro)
    },
    setSize: (layout, size) => {
      currentSize = size
      write(layout)
    },
    setCoveredRegion: (layout, polygon) => {
      hiddenMicro = polygon ? coveredDrops(layout.micro, polygon) : null
      hiddenMacro = polygon ? coveredDrops(layout.macro, polygon) : null
      write(layout)
      const count = (mask: Uint8Array | null) => (mask ? mask.reduce((sum, v) => sum + v, 0) : 0)
      return count(hiddenMicro) + count(hiddenMacro)
    },
    setAmount: (layout, amount, enabled) => {
      micro.count = visibleCount(layout.micro, amount)
      macro.count = visibleCount(layout.macro, amount)
      enabledNow = enabled
      updateMicroVisibility()
      macro.visible = enabled && macro.count > 0
    },
    setSimplified: (value) => {
      simplified = value
      updateMicroVisibility()
    },
    setIntensity: (value) => {
      intensity.value = value
    },
    dispose: () => {
      for (const mesh of [micro, macro]) {
        mesh.dispose()
        mesh.geometry.dispose()
      }
      microMaterial.dispose()
      macroMaterial.dispose()
    },
  }
}
