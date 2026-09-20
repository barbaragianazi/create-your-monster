import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useImperativeHandle, useRef, type ComponentRef, type Ref } from 'react'
import { MathUtils, Raycaster, Spherical, Vector2, Vector3, type Object3D } from 'three'
import {
  INITIAL_CAMERA_POSITION,
  INITIAL_TARGET,
  POLAR_LIMITS,
  ZOOM_LIMITS,
  ZOOM_STEP,
} from './viewerConfig'

export type ViewApi = {
  zoomIn: () => void
  zoomOut: () => void
  /** restaura só a visualização (câmera/target/zoom); nunca toca nas personalizações */
  reset: () => void
}

export type ZoomState = { atMin: boolean; atMax: boolean }

type Goal = { kind: 'zoom'; distance: number } | { kind: 'reset' }

const SMOOTHING = 7 // maior = transição mais rápida
const EPSILON_DISTANCE = 0.005
const EPSILON_ANGLE = 0.002
const ZOOM_EDGE = 0.02

const initialPosition = new Vector3(...INITIAL_CAMERA_POSITION)
const initialTarget = new Vector3(...INITIAL_TARGET)
const initialSpherical = new Spherical().setFromVector3(initialPosition.clone().sub(initialTarget))

// Elementos que, no futuro, terão interação própria devem ter userData.interactive = true
function isInteractive(object: Object3D | null) {
  for (let node = object; node; node = node.parent) {
    if (node.userData.interactive) return true
  }
  return false
}

export default function CameraRig({
  apiRef,
  onZoomState,
}: {
  apiRef: Ref<ViewApi>
  onZoomState: (state: ZoomState) => void
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const goal = useRef<Goal | null>(null)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const domElement = useThree((state) => state.gl.domElement)

  const currentDistance = useCallback(() => {
    const controls = controlsRef.current
    return controls ? camera.position.distanceTo(controls.target) : initialSpherical.radius
  }, [camera])

  const zoomBy = useCallback(
    (factor: number) => {
      const base = goal.current?.kind === 'zoom' ? goal.current.distance : currentDistance()
      goal.current = {
        kind: 'zoom',
        distance: MathUtils.clamp(base * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max),
      }
    },
    [currentDistance],
  )

  // Única função de reset: botão e duplo clique chamam esta mesma função
  const resetView = useCallback(() => {
    // acaba de vez com a inércia de um arrasto recente, para ela não brigar com a animação
    const controls = controlsRef.current
    if (controls) {
      controls.enableDamping = false
      controls.update()
      controls.enableDamping = true
    }
    goal.current = { kind: 'reset' }
  }, [])

  useImperativeHandle(
    apiRef,
    () => ({ zoomIn: () => zoomBy(1 / ZOOM_STEP), zoomOut: () => zoomBy(ZOOM_STEP), reset: resetView }),
    [zoomBy, resetView],
  )

  useEffect(() => {
    const raycaster = new Raycaster()
    const pointer = new Vector2()

    const onDoubleClick = (event: MouseEvent) => {
      const rect = domElement.getBoundingClientRect()
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hitInteractive = raycaster.intersectObjects(scene.children, true).some((hit) => isInteractive(hit.object))
      if (!hitInteractive) resetView()
    }

    domElement.addEventListener('dblclick', onDoubleClick)
    return () => domElement.removeEventListener('dblclick', onDoubleClick)
  }, [domElement, camera, scene, resetView])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const active = goal.current
    if (!controls || !active) return

    const offset = camera.position.clone().sub(controls.target)

    if (active.kind === 'zoom') {
      const distance = MathUtils.damp(offset.length(), active.distance, SMOOTHING, delta)
      const done = Math.abs(distance - active.distance) < EPSILON_DISTANCE
      offset.setLength(done ? active.distance : distance)
      camera.position.copy(controls.target).add(offset)
      if (done) goal.current = null
    } else {
      const current = new Spherical().setFromVector3(offset)
      const deltaTheta = MathUtils.euclideanModulo(initialSpherical.theta - current.theta + Math.PI, Math.PI * 2) - Math.PI
      const remaining = {
        radius: initialSpherical.radius - current.radius,
        phi: initialSpherical.phi - current.phi,
        theta: deltaTheta,
      }

      controls.target.lerp(initialTarget, 1 - Math.exp(-SMOOTHING * delta))
      const done =
        Math.abs(remaining.radius) < EPSILON_DISTANCE &&
        Math.abs(remaining.phi) < EPSILON_ANGLE &&
        Math.abs(remaining.theta) < EPSILON_ANGLE

      if (done) {
        // termina exatamente no enquadramento salvo: sem damping, um update() descarta a inércia residual
        controls.enableDamping = false
        controls.update()
        controls.enableDamping = true
        controls.target.copy(initialTarget)
        camera.position.copy(initialPosition)
        goal.current = null
      } else {
        current.radius = MathUtils.damp(current.radius, initialSpherical.radius, SMOOTHING, delta)
        current.phi = MathUtils.damp(current.phi, initialSpherical.phi, SMOOTHING, delta)
        current.theta = initialSpherical.theta - MathUtils.damp(deltaTheta, 0, SMOOTHING, delta)
        offset.setFromSpherical(current)
        camera.position.copy(controls.target).add(offset)
      }
    }

    controls.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={INITIAL_TARGET}
      enablePan={false}
      enableDamping
      minDistance={ZOOM_LIMITS.min}
      maxDistance={ZOOM_LIMITS.max}
      minPolarAngle={POLAR_LIMITS.min}
      maxPolarAngle={POLAR_LIMITS.max}
      // se o usuário pegar a lata durante uma transição, a interação dele tem prioridade
      onStart={() => {
        goal.current = null
      }}
      onChange={() => {
        const distance = currentDistance()
        onZoomState({
          atMin: distance <= ZOOM_LIMITS.min + ZOOM_EDGE,
          atMax: distance >= ZOOM_LIMITS.max - ZOOM_EDGE,
        })
      }}
    />
  )
}
