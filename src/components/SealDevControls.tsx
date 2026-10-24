import {
  LOGO_COLOR_MODE_OPTIONS,
  SEAL_STYLE_OPTIONS,
  autoLogoColor,
  type LogoColorMode,
  type SealCustomization,
  type SealLogoConfig,
  type SealStyle,
} from './sealStyle'

const BUTTON_ON = 'border-neutral-800 bg-neutral-800 text-white'
const BUTTON_OFF = 'border-neutral-400 bg-white'

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span>{label}</span>
      <div role="group" aria-label={`Lacre: ${label}`} className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded border px-1 py-2 text-xs ${value === option.id ? BUTTON_ON : BUTTON_OFF}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Ferramenta temporária de calibração (não faz parte da UI final). Posição e escala do M são definidas pelo sistema.
// Cor e acabamento da superfície preenchida são os do próprio lacre (controles acima).
export default function SealDevControls({
  value,
  sealColor,
  onChange,
}: {
  value: SealCustomization
  sealColor: string
  onChange: (value: SealCustomization) => void
}) {
  const patchLogo = (patch: Partial<SealLogoConfig>) => onChange({ ...value, logo: { ...value.logo, ...patch } })

  return (
    <>
      <Segmented<SealStyle>
        label="Estilo"
        options={SEAL_STYLE_OPTIONS}
        value={value.style}
        onChange={(style) => onChange({ ...value, style })}
      />

      {value.style === 'custom' && (
        <>
          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={value.logo.enabled}
              aria-label="Lacre: Logo Monster M"
              onChange={(e) => patchLogo({ enabled: e.target.checked })}
            />
            Logo Monster M
          </label>

          {value.logo.enabled && (
            <>
              <Segmented<LogoColorMode>
                label="Cor do logo"
                options={LOGO_COLOR_MODE_OPTIONS}
                value={value.logo.colorMode}
                onChange={(colorMode) => patchLogo({ colorMode })}
              />

              {value.logo.colorMode === 'auto' ? (
                <p className="text-xs text-neutral-600">
                  Contraste com o lacre: {autoLogoColor(sealColor) === '#000000' ? 'preto' : 'branco'}
                </p>
              ) : (
                <label className="flex items-center justify-between gap-4">
                  Cor
                  <input
                    type="color"
                    value={value.logo.manualColor}
                    aria-label="Lacre: Cor do M"
                    onChange={(e) => patchLogo({ manualColor: e.target.value })}
                  />
                </label>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
