import { Download } from 'lucide-react'
import { motion } from 'motion/react'
import { GROUPS, type GroupId } from './editorNav'
import { useLayoutMode } from './useLayoutMode'

// sugestões viram issues no repositório (o formulário em .github/ISSUE_TEMPLATE/sugestao.yml é aberto direto)
const SUGGEST_URL = 'https://github.com/barbaragianazi/create-your-monster/issues/new?template=sugestao.yml'

/*
 * Cabeçalho compacto: título inclinado com duas lâminas verdes, passos que espelham os grupos do painel (clicar abre o grupo) e a
 * borda de baixo cortada na diagonal. O título é um <h1>; os passos somem em telas estreitas (a coluna de ícones já navega).
 */
export default function AppHeader({
  group,
  onGroupChange,
  onDownload,
}: {
  group: GroupId
  onGroupChange: (group: GroupId) => void
  /** baixa a imagem com as opções de exportação atuais: a ação final do app fica sempre à vista (só no desktop; no celular o botão abre a aba Exportar) */
  onDownload: () => void
}) {
  // no celular o cabeçalho é mais baixo (a altura é do palco da lata) e respeita a área segura do topo
  const mode = useLayoutMode()
  const compact = mode !== 'desktop'
  const height = mode === 'landscape' ? '2.5rem' : '3rem'
  return (
    <motion.header
      initial={{ y: -72 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative z-20 flex shrink-0 items-center bg-black ${compact ? 'gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]' : 'h-16 gap-6 pl-5 pr-8 md:pl-8'}`}
      style={{
        clipPath: compact
          ? 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 20px) 100%, 0 100%)'
          : 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 30px) 100%, 0 100%)',
        height: compact ? `calc(${height} + env(safe-area-inset-top, 0px))` : undefined,
        paddingTop: compact ? 'env(safe-area-inset-top, 0px)' : undefined,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-primary via-primary/50 to-transparent" />

      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex gap-1 max-[359px]:hidden">
          <span className={`-skew-x-[14deg] bg-primary ${compact ? 'h-6' : 'h-8'} w-1.5`} />
          <span className={`-skew-x-[14deg] bg-primary/50 ${compact ? 'h-6' : 'h-8'} w-1`} />
        </span>
        <h1 className={`-skew-x-[10deg] whitespace-nowrap font-monster font-bold uppercase leading-none tracking-wide text-white ${compact ? 'text-base min-[360px]:text-xl min-[400px]:text-2xl' : 'text-2xl min-[1400px]:text-4xl'}`}>
          <motion.span initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, duration: 0.5 }} className="inline-block">
            Create your
          </motion.span>{' '}
          <motion.span
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="inline-block text-primary [text-shadow:0_0_20px_rgb(128_225_0/0.55)]"
          >
            Monster
          </motion.span>
        </h1>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-6">
        <nav aria-label="Etapas" className="hidden items-center gap-1 min-[1600px]:flex">
          {GROUPS.map(({ id, label }, index) => {
            const active = id === group
            return (
              <button
                key={id}
                type="button"
                onClick={() => onGroupChange(id)}
                aria-current={active ? 'step' : undefined}
                className={`-skew-x-[14deg] min-h-12 px-4 transition-colors ${
                  active ? 'bg-primary text-black' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                <span className="flex skew-x-[14deg] items-baseline gap-2">
                  <span className="font-monster text-xl leading-none">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <button
          type="button"
          // no celular o botão abre as opções (a aba Exportar); no desktop continua baixando direto
          onClick={compact ? () => onGroupChange('export') : onDownload}
          aria-label={compact ? 'Exportar' : 'Baixar imagem'}
          title={compact ? 'Exportar' : 'Baixar imagem'}
          className={`bg-primary text-black transition-colors hover:bg-white active:bg-white ${
            compact ? 'flex size-11 items-center justify-center' : '-skew-x-[14deg] min-h-11 px-4'
          }`}
        >
          {compact ? (
            <Download aria-hidden size={20} strokeWidth={2.25} />
          ) : (
            <span className="flex skew-x-[14deg] items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
              <Download aria-hidden size={16} strokeWidth={2.25} />
              Baixar imagem
            </span>
          )}
        </button>

        <a
          href={SUGGEST_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Sugerir uma melhoria no GitHub"
          aria-label="Sugerir uma melhoria no GitHub"
          className="-mr-2 flex min-h-12 min-w-12 items-center justify-center gap-2 text-neutral-400 transition-colors hover:text-primary active:text-primary"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-5 w-5 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          <span className={`hidden text-[10px] font-semibold uppercase tracking-widest ${compact ? '' : 'sm:inline'}`}>Sugerir melhoria</span>
        </a>
      </div>
    </motion.header>
  )
}
