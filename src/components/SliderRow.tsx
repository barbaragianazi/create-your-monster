import { useId, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

// Linha de ajuste numérico: rótulo, [−] barra [+] e valor. Os botões fazem o ajuste que o dedo não consegue na barra
// (no celular a linha vira rótulo + valor em cima e o controle embaixo, com alvos de 44px; ver .slider-row em index.css).

const BUTTONS_PER_RANGE = 20 // um toque em − ou + move 5% do intervalo

function decimals(step: number) {
  const text = String(step)
  return text.includes('.') ? text.split('.')[1].length : 0
}

export default function SliderRow({
  label,
  scope,
  min,
  max,
  step = 0.01,
  value,
  format = (v) => v.toFixed(2),
  disabled,
  lead,
  onChange,
}: {
  label: string
  /** prefixo do nome acessível ("Texto: Escala"), quando o mesmo rótulo se repete em mais de um elemento */
  scope?: string
  min: number
  max: number
  step?: number
  value: number
  format?: (value: number) => string
  disabled?: boolean
  /** controle extra, com rótulo próprio, no começo da linha do ajuste (ex.: a cor do elemento), para não gastar uma linha só com ele */
  lead?: { label: string; control: ReactNode }
  onChange: (value: number) => void
}) {
  const id = useId()
  const name = scope ? `${scope}: ${label}` : label
  const jump = Math.max(step, Math.round((max - min) / BUTTONS_PER_RANGE / step) * step)
  const nudge = (direction: 1 | -1) => {
    const next = Math.min(max, Math.max(min, value + direction * jump))
    onChange(Number(next.toFixed(decimals(step))))
  }

  const row = (
    <div className="slider-row grid min-w-0 flex-1 items-center gap-2">
      <label htmlFor={id}>{label}</label>
      <div className="slider-stepper flex items-center gap-1.5">
        <button
          type="button"
          className="slider-nudge"
          aria-label={`Diminuir ${name}`}
          disabled={disabled || value <= min}
          onClick={() => nudge(-1)}
        >
          <Minus size={12} aria-hidden />
        </button>
        <input
          id={id}
          type="range"
          className="min-w-0 flex-1"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={name}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          className="slider-nudge"
          aria-label={`Aumentar ${name}`}
          disabled={disabled || value >= max}
          onClick={() => nudge(1)}
        >
          <Plus size={12} aria-hidden />
        </button>
      </div>
      <span className="text-right tabular-nums">{format(value)}</span>
    </div>
  )

  if (!lead) return row
  // o controle extra ganha o próprio rótulo em cima; a base dos dois fica alinhada (amostra com a fileira do slider)
  return (
    <div className="flex items-end gap-3">
      <div className="flex flex-none flex-col gap-1">
        <span>{lead.label}</span>
        {lead.control}
      </div>
      {row}
    </div>
  )
}
