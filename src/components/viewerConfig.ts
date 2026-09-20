// Enquadramento inicial: única fonte de verdade para a câmera inicial, o reset e os limites do OrbitControls
export const INITIAL_CAMERA_POSITION = [0, 4, 8.5] as const
export const INITIAL_TARGET = [0, 0, 0] as const
export const CAMERA_FOV = 35

// Distância câmera–lata: a inicial (~9,4) fica dentro da faixa.
// min 4: a superfície está a ~3,2 da câmera, então nunca atravessa o modelo (raio 0,83)
// max 12: a lata ainda ocupa ~54% da altura da viewport
export const ZOOM_LIMITS = { min: 4, max: 12 } as const

// Ângulo polar: de ~30° (vista de cima) a 100° (levemente abaixo do horizonte); impede virar de cabeça para baixo
export const POLAR_LIMITS = { min: Math.PI / 6, max: (Math.PI * 5) / 9 } as const

// Cada clique em + / − multiplica a distância por este fator (ou divide)
export const ZOOM_STEP = 1.25
