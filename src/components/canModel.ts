import { BufferGeometry, Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { CAN_PARTS, type CanPart } from './canMaterials'

// Tampa e fundo são duas peças desconectadas do mesmo mesh/material no GLB.
// Aqui o fundo vira um mesh próprio (mesmos vértices, índices só dos triângulos de baixo)
// com um material clonado, para ter cor e acabamento independentes da tampa.
function splitBottom(scene: Object3D) {
  const topMeshes: Mesh[] = []
  scene.traverse((object) => {
    const mesh = object as Mesh
    const material = mesh.material as MeshStandardMaterial | undefined
    if (mesh.isMesh && material?.name === CAN_PARTS.top.materialName) topMeshes.push(mesh)
  })

  for (const mesh of topMeshes) {
    const { geometry } = mesh
    const index = geometry.index
    if (!index || !mesh.parent) continue

    const position = geometry.getAttribute('position')
    const topIndices: number[] = []
    const bottomIndices: number[] = []
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      const b = index.getX(i + 1)
      const c = index.getX(i + 2)
      const centerY = (position.getY(a) + position.getY(b) + position.getY(c)) / 3
      ;(centerY > 0 ? topIndices : bottomIndices).push(a, b, c)
    }

    const bottomGeometry = new BufferGeometry()
    for (const name of Object.keys(geometry.attributes)) {
      bottomGeometry.setAttribute(name, geometry.getAttribute(name))
    }
    bottomGeometry.setIndex(bottomIndices)
    geometry.setIndex(topIndices)

    const bottomMaterial = (mesh.material as MeshStandardMaterial).clone()
    bottomMaterial.name = CAN_PARTS.bottom.materialName

    const bottomMesh = new Mesh(bottomGeometry, bottomMaterial)
    bottomMesh.name = `${mesh.name}.bottom`
    bottomMesh.position.copy(mesh.position)
    bottomMesh.quaternion.copy(mesh.quaternion)
    bottomMesh.scale.copy(mesh.scale)
    mesh.parent.add(bottomMesh)
  }
}

export function findPartMesh(scene: Object3D, part: CanPart) {
  let found: Mesh | undefined
  scene.traverse((object) => {
    const mesh = object as Mesh
    // meshes gerados em código (ex.: a tampa do lacre personalizado) compartilham o material, mas não são a peça do GLB
    if (mesh.userData.generated) return
    if (!found && mesh.isMesh && (mesh.material as MeshStandardMaterial).name === CAN_PARTS[part].materialName) found = mesh
  })
  return found
}

// O scene do useGLTF é cacheado, então a separação só pode acontecer uma vez
export function prepareCanScene(scene: Object3D) {
  if (!scene.userData.bottomSplit) {
    splitBottom(scene)
    scene.userData.bottomSplit = true
  }

  const materials: Partial<Record<CanPart, MeshStandardMaterial>> = {}
  scene.traverse((object) => {
    const material = (object as Mesh).material as MeshStandardMaterial | undefined
    if (!material) return
    for (const part of Object.keys(CAN_PARTS) as CanPart[]) {
      if (material.name === CAN_PARTS[part].materialName) materials[part] = material
    }
  })
  return materials
}
