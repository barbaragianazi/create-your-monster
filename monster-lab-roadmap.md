# Monster Lab --- Roadmap de Desenvolvimento

> **Tipo:** Projeto conceitual / não oficial para portfólio pessoal\
> **Conceito:** Configurador 3D de lata Monster altamente
> personalizável\
> **Objetivo:** Criar uma experiência digital interativa em que o
> usuário parte de uma lata neutra e constrói sua própria versão em
> tempo real.

------------------------------------------------------------------------

## 1. Visão do produto

### Conceito

Criar uma experiência chamada de **Monster Lab - Create
Your Monster**.

O usuário inicia com uma lata completamente branca/neutra e personaliza
progressivamente:

-   tamanho/formato da lata de acordo com os países ;
-   cor do corpo;
-   acabamento;
-   logo;
-   textos;
-   elementos gráficos;
-   tampa;
-   lacre;
-   presença ou ausência do logo no lacre;
-   sabor;
-   cores secundárias;
-   padrões e efeitos.

A lata deve ser exibida em **3D em tempo real** e ser o elemento
principal da interface.

### Princípios

1.  A lata é sempre a protagonista.
2.  Toda alteração deve ter feedback visual imediato.
3.  A interface deve reagir visualmente à personalização.
4.  O usuário deve conseguir editar tanto pelo painel quanto diretamente
    pelo modelo 3D.
5.  O fluxo deve ser simples apesar da grande quantidade de
    possibilidades.
6.  IA não é necessária para o funcionamento principal.
7.  O projeto deve demonstrar UX/UI, design system, motion, 3D e
    front-end.

------------------------------------------------------------------------

## 2. Stack sugerida

### Front-end

-   React
-   TypeScript
-   Vite

### 3D

-   Three.js
-   React Three Fiber
-   Drei

### Interface e animação

-   CSS / CSS Modules ou Tailwind, conforme decisão do projeto
-   Framer Motion
-   Lucide React para ícones

### Modelo 3D

-   Blender
-   Exportação `.glb` / `.gltf`

### Deploy

-   GitHub
-   Vercel

### Exportação

-   PNG

------------------------------------------------------------------------

## 3. Arquitetura da experiência

Fluxo principal:

``` text
01 — Intro
      ↓
02 — Can
      ↓
03 — Branding
      ↓
04 — Top
      ↓
05 — Flavor & Art
      ↓
06 — Reveal
```

A experiência deve preferencialmente funcionar como uma aplicação
contínua, sem navegação tradicional entre várias páginas.

------------------------------------------------------------------------

## 4. Tela inicial

### Objetivo

Apresentar imediatamente o conceito.

### Elementos

-   lata 3D branca;
-   fundo neutro;
-   logo/título do projeto;
-   headline;
-   CTA principal.

### Copy inicial sugerida

**UNLEASH YOURS.**

**Start creating →**

### Interação

Ao iniciar: - controles aparecem; - câmera pode se aproximar da lata; -
interface entra com animação; - inicia etapa 1.

------------------------------------------------------------------------

## 5. Modelo 3D

O arquivo 3D deve possuir objetos/materiais independentes.

Estrutura sugerida:

``` text
Can
├── Body
├── MonsterLogo
├── MonsterText
├── EnergyText
├── SecondaryGraphics
├── Top
├── Tab
├── TabLogo
└── Bottom
```

### Requisitos

Cada região que poderá ser personalizada deve possuir material ou mesh
independente.

### Interações

-   drag horizontal/vertical → rotação;
-   hover → destacar região editável;
-   click → selecionar região;
-   zoom limitado;
-   reset de câmera;
-   transições suaves.

### Seleção direta

Ao passar o mouse sobre uma região editável: - aplicar highlight
discreto; - mudar cursor; - opcionalmente exibir tooltip.

Exemplo:

``` text
[ M ]
  ↑
Logo color
```

Ao clicar no logo, o painel deve abrir diretamente as opções de
branding/logo.

------------------------------------------------------------------------

## 6. Tamanho da lata

As latas podem variar de tamanho e proporção conforme mercado e linha. O
configurador deve refletir isso.

### Opções iniciais

-   355 ml
-   473 ml / 16 oz
-   500 ml
-   568 ml ou outros formatos adicionados posteriormente

> Validar os tamanhos finais e suas proporções antes da modelagem
> definitiva.

### Comportamento

A alteração não deve modificar apenas o texto de capacidade.

O modelo deve: - alterar altura; - alterar proporção; - manter
diâmetro/proporção adequada ao formato; - ajustar enquadramento da
câmera automaticamente; - reposicionar elementos gráficos quando
necessário.

------------------------------------------------------------------------

## 7. Personalização --- CAN

### Controles

-   cor principal;
-   acabamento;
-   gradiente;
-   textura/pattern.

### Acabamentos

-   Matte
-   Glossy
-   Metallic

### Futuro

Possibilidade de adicionar: - brushed metal; - chrome; - holographic.

------------------------------------------------------------------------

## 8. Personalização --- BRANDING

Permitir controlar independentemente:

-   cor do `M`;
-   cor de `MONSTER`;
-   cor de `ENERGY`;
-   elementos gráficos secundários.

### Possível evolução

Permitir diferentes tratamentos:

-   solid;
-   metallic;
-   chrome;
-   gradient;
-   emissive/glow.

------------------------------------------------------------------------

## 9. Personalização --- TOP

### Tampa

-   silver;
-   black;
-   custom color.

### Lacre

-   cor;
-   acabamento.

### Logo no lacre

Controle obrigatório:

``` text
Logo on tab

[ ON / OFF ]
```

Se ON: - mostrar logo; - permitir escolher cor do logo.

Se OFF: - ocultar completamente o logo do lacre.

------------------------------------------------------------------------

## 10. Personalização --- FLAVOR

O usuário poderá selecionar ou criar uma direção de sabor.

### Informações

-   nome do sabor;
-   categoria/base;
-   cor primária;
-   cor secundária;
-   elementos gráficos associados.

### Exemplos conceituais

-   Dark Berry
-   Toxic Lime
-   Cherry Voltage
-   Arctic Zero
-   Electric Mango

Os sabores podem ser fictícios, deixando claro que fazem parte de um
projeto conceitual.

------------------------------------------------------------------------

## 11. Custom Art

Criar uma camada adicional de personalização.

### Patterns iniciais

-   Flames
-   Lightning
-   Glitch
-   Gradient
-   Waves
-   Chrome
-   Geometric

### Controles

Dependendo do pattern: - cor; - intensidade; - escala; - rotação; -
opacidade.

Não implementar todos no MVP.

------------------------------------------------------------------------

## 12. Estado global da personalização

Criar um objeto central para representar a lata.

Exemplo conceitual:

``` ts
interface CanConfiguration {
  size: string;

  body: {
    color: string;
    finish: "matte" | "glossy" | "metallic";
  };

  branding: {
    logoColor: string;
    monsterTextColor: string;
    energyTextColor: string;
  };

  top: {
    color: string;
    tabColor: string;
    tabLogoEnabled: boolean;
    tabLogoColor: string;
  };

  flavor: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
  };

  art: {
    pattern: string | null;
    color: string;
    intensity: number;
  };
}
```

Toda a aplicação deve reagir a esse estado.

------------------------------------------------------------------------

## 13. Cenário dinâmico

O cenário deve reagir automaticamente às escolhas do usuário.

### Importante

Isso **não depende de IA**.

### Fluxo

``` text
Usuário altera a lata
        ↓
Estado global é atualizado
        ↓
Materiais 3D são atualizados
        ↓
Accent color é recalculada
        ↓
Background reage
        ↓
Iluminação 3D reage
        ↓
Glow/reflexos reagem
        ↓
UI reage
```

### Exemplo

Configuração:

``` text
Body: #111111
Logo: #B6FF00
```

Resultado:

``` text
background → dark
rim light → #B6FF00
glow → #B6FF00
UI accent → #B6FF00
```

### CSS Variables

``` css
:root {
  --can-color: #ffffff;
  --logo-color: #00ff38;
  --accent-color: #00ff38;
  --environment-color: #00ff38;
}
```

React deve atualizar essas variáveis conforme o estado.

------------------------------------------------------------------------

## 14. Iluminação 3D

Criar iluminação com aparência de fotografia de produto.

Estrutura inicial:

-   key light;
-   fill light;
-   rim light;
-   environment/reflections.

### Reação dinâmica

A rim light e/ou luzes secundárias podem assumir a accent color
selecionada.

### Objetivo

A lata deve parecer um produto real, não apenas um objeto 3D básico.

------------------------------------------------------------------------

## 15. Painel de personalização

Desktop:

``` text
┌─────────────────────────────────────────────────────────────┐
│ MONSTER LAB                              02 / 06            │
│                                                             │
│ CREATE YOUR          ┌──────────────┐      CUSTOMIZE        │
│ MONSTER              │              │                       │
│                      │   CAN 3D     │      Body             │
│                      │              │      Logo             │
│                      │    ↔ drag    │      Details          │
│                      │              │                       │
│                      └──────────────┘      [color picker]    │
│                                                             │
│ RESET                                      NEXT →           │
└─────────────────────────────────────────────────────────────┘
```

### Prioridades

-   canvas 3D: aproximadamente 50--60% da área;
-   painel lateral contextual;
-   progresso sempre visível;
-   reset disponível;
-   próximo/anterior.

------------------------------------------------------------------------

## 16. Mobile

Não adaptar simplesmente o desktop.

Estrutura sugerida:

``` text
┌─────────────────┐
│ MONSTER LAB     │
│                 │
│                 │
│     CAN 3D      │
│                 │
│                 │
├─────────────────┤
│ Customize       │
│ ○ ○ ○ ○ ○       │
│                 │
│ controls...     │
└─────────────────┘
```

Usar: - bottom sheet; - tabs; - controles grandes; - gestures para
rotação; - canvas sempre visível.

------------------------------------------------------------------------

## 17. Reveal final

Ao concluir:

``` text
YOUR MONSTER
IS READY.
```

Exibir: - lata; - nome do sabor; - tamanho; - acabamento; - paleta; -
animação de câmera; - cenário reagindo à paleta.

Exemplo:

``` text
MIDNIGHT TOXIC

BLACK CHERRY
ENERGY DRINK

500 ML • METALLIC

#121212
#A6FF00
#D60045
```

------------------------------------------------------------------------

## 18. Exportação

A exportação principal também **não depende de IA**.

### Opções

#### Product Shot

Exporta: - lata; - fundo; - iluminação; - composição.

#### Transparent PNG

Exporta: - somente a lata; - fundo transparente.

#### Desktop Wallpaper

Formato: - 16:9.

#### Mobile Wallpaper

Formato: - 9:16.

### Implementação

Capturar o canvas renderizado pelo Three.js.

Quando necessário, usar Canvas API para montar: - render da lata; -
textos; - nome; - paleta; - informações.

### Atenção

Testar: - resolução; - `preserveDrawingBuffer`; - transparência; -
qualidade; - performance; - comportamento mobile.

------------------------------------------------------------------------

## 19. IA --- opcional

IA não deve ser requisito do produto.

### Feature experimental futura

**Generate a background**

Fluxo:

``` text
Configuração da lata
        ↓
Paleta + sabor + acabamento
        ↓
Prompt estruturado
        ↓
Serviço de geração
        ↓
Background exclusivo
```

Essa funcionalidade deve ser tratada como evolução posterior e não
bloquear o MVP.

------------------------------------------------------------------------

## 20. Motion

Usar animações para reforçar interação, não apenas decoração.

### Exemplos

-   entrada da lata;
-   aproximação da câmera;
-   transição entre etapas;
-   painel contextual;
-   troca de materiais;
-   reveal;
-   highlight no hover;
-   mudança suave do ambiente.

Evitar animações excessivas que prejudiquem performance.

------------------------------------------------------------------------

## 21. Design System

Criar tokens desde o início.

### Tokens mínimos

#### Colors

-   background;
-   surface;
-   text;
-   muted;
-   border;
-   accent;
-   accent-contrast.

#### Spacing

Escala baseada em 4px.

#### Typography

-   Display
-   Heading
-   Body
-   Label

#### Radius

-   sm
-   md
-   lg
-   full

#### Motion

-   fast
-   normal
-   slow
-   easing-standard
-   easing-emphasis

### Componentes

-   Button
-   IconButton
-   ColorPicker
-   ColorSwatch
-   Toggle
-   Slider
-   Tabs
-   Stepper
-   Tooltip
-   BottomSheet
-   CustomizationSection

------------------------------------------------------------------------

## 22. Acessibilidade

Mesmo sendo uma experiência visual:

-   navegação por teclado;
-   foco visível;
-   labels nos controles;
-   não depender somente de cor;
-   contraste adequado;
-   alternativas para gestos;
-   respeitar `prefers-reduced-motion`;
-   aria-label em controles gráficos;
-   estados ON/OFF explícitos.

------------------------------------------------------------------------

## 23. Performance

3D deve ser tratado como requisito técnico desde o início.

### Cuidados

-   otimizar polígonos;
-   comprimir `.glb`;
-   otimizar texturas;
-   evitar texturas 4K desnecessárias;
-   lazy loading;
-   limitar DPR em dispositivos fracos;
-   controlar sombras;
-   reduzir pós-processamento no mobile;
-   monitorar FPS;
-   loading state durante carregamento do modelo.

------------------------------------------------------------------------

## 24. Persistência

### MVP

Persistir configuração no `localStorage`.

### Evolução

Gerar configuração serializada para compartilhamento.

Exemplo conceitual:

``` text
/creation?body=111111&logo=b6ff00&size=500&finish=metallic
```

Melhor opção futura: - gerar um ID curto; - armazenar JSON; - permitir
abrir a mesma criação via link.

------------------------------------------------------------------------

## 25. Randomize

Feature recomendada após o MVP.

Botão:

**SURPRISE ME**

Seleciona aleatoriamente: - cores; - acabamento; - flavor; - art; - top.

Manter combinações minimamente coerentes através de presets/regras.

------------------------------------------------------------------------

## 26. Reset e Undo

### Reset

Volta à lata branca inicial.

Antes de resetar uma configuração avançada, pedir confirmação.

### Undo/Redo

Feature futura interessante para experiência de criação.

Não necessária no primeiro MVP.

------------------------------------------------------------------------

# ROADMAP DE IMPLEMENTAÇÃO

## Fase 0 --- Definição

### Objetivo

Fechar escopo antes de programar.

### Tarefas

-   [ ] definir nome do projeto;
-   [ ] definir direção visual;
-   [ ] definir tamanhos suportados;
-   [ ] validar proporções das latas;
-   [ ] definir todas as regiões personalizáveis;
-   [ ] definir MVP;
-   [ ] definir features futuras;
-   [ ] criar wireframe;
-   [ ] criar UI principal no Figma;
-   [ ] criar estados mobile.

### Entregável

Figma + documentação inicial.

------------------------------------------------------------------------

## Fase 1 --- Setup

### Tarefas

-   [ ] criar projeto React + TypeScript + Vite;
-   [ ] configurar estrutura de pastas;
-   [ ] instalar Three.js;
-   [ ] instalar React Three Fiber;
-   [ ] instalar Drei;
-   [ ] instalar Framer Motion;
-   [ ] configurar lint/format;
-   [ ] criar tokens;
-   [ ] configurar Git;
-   [ ] criar repositório;
-   [ ] configurar Vercel.

### Critério de conclusão

Aplicação vazia funcionando localmente e em deploy.

------------------------------------------------------------------------

## Fase 2 --- Modelo 3D

### Tarefas

-   [ ] obter/criar modelo base;
-   [ ] ajustar proporções;
-   [ ] separar meshes;
-   [ ] criar materiais;
-   [ ] preparar UVs;
-   [ ] exportar GLB;
-   [ ] importar no React Three Fiber;
-   [ ] configurar câmera;
-   [ ] configurar OrbitControls;
-   [ ] configurar iluminação;
-   [ ] otimizar modelo.

### Critério de conclusão

Lata branca renderizada, girando e responsiva.

------------------------------------------------------------------------

## Fase 3 --- Estado da personalização

### Tarefas

-   [ ] criar `CanConfiguration`;
-   [ ] criar valores default;
-   [ ] implementar gerenciamento de estado;
-   [ ] conectar estado aos materiais;
-   [ ] implementar reset;
-   [ ] persistir localmente.

### Critério de conclusão

Alterar valores no código modifica a lata imediatamente.

------------------------------------------------------------------------

## Fase 4 --- MVP do configurador

Implementar somente:

-   [ ] tamanho;
-   [ ] body color;
-   [ ] logo color;
-   [ ] top color;
-   [ ] tab color;
-   [ ] logo do lacre ON/OFF;
-   [ ] acabamento;
-   [ ] 4 sabores/presets;
-   [ ] reset.

### Critério de conclusão

Usuário consegue criar uma lata completa sem recarregar a aplicação.

------------------------------------------------------------------------

## Fase 5 --- UI

### Tarefas

-   [ ] stepper;
-   [ ] painel lateral;
-   [ ] color picker;
-   [ ] swatches;
-   [ ] toggles;
-   [ ] sliders;
-   [ ] tooltips;
-   [ ] estados ativos;
-   [ ] navegação entre etapas;
-   [ ] feedback visual;
-   [ ] responsividade.

### Critério de conclusão

Toda personalização pode ser feita pela interface.

------------------------------------------------------------------------

## Fase 6 --- Interação direta no 3D

### Tarefas

-   [ ] detectar hover;
-   [ ] highlight;
-   [ ] detectar clique;
-   [ ] mapear mesh → controle;
-   [ ] abrir seção correspondente;
-   [ ] indicar região selecionada.

### Critério de conclusão

Usuário consegue clicar no M, tampa, lacre etc. para editar diretamente.

------------------------------------------------------------------------

## Fase 7 --- Cenário dinâmico

### Tarefas

-   [ ] definir accent color;
-   [ ] conectar CSS Variables;
-   [ ] atualizar background;
-   [ ] atualizar rim light;
-   [ ] atualizar glow;
-   [ ] criar transições;
-   [ ] validar contraste.

### Critério de conclusão

A atmosfera da aplicação reage à criação em tempo real.

------------------------------------------------------------------------

## Fase 8 --- Flavor & Custom Art

### Tarefas

-   [ ] presets de sabor;
-   [ ] nome;
-   [ ] cores;
-   [ ] patterns iniciais;
-   [ ] controles de intensidade;
-   [ ] aplicar texturas/material;
-   [ ] testar combinações.

### Critério de conclusão

A personalização deixa de ser apenas troca de cores.

------------------------------------------------------------------------

## Fase 9 --- Reveal

### Tarefas

-   [ ] tela final;
-   [ ] câmera cinematográfica;
-   [ ] nome da criação;
-   [ ] resumo;
-   [ ] paleta;
-   [ ] acabamento;
-   [ ] tamanho;
-   [ ] animação de entrada.

### Critério de conclusão

Criação possui uma apresentação final própria.

------------------------------------------------------------------------

## Fase 10 --- Exportação

### Ordem recomendada

1.  Product Shot
2.  Transparent PNG
3.  Desktop Wallpaper
4.  Mobile Wallpaper

### Tarefas

-   [ ] capturar canvas;
-   [ ] exportar PNG;
-   [ ] controlar resolução;
-   [ ] implementar transparência;
-   [ ] criar composição;
-   [ ] gerar wallpapers;
-   [ ] testar desktop/mobile.

### Critério de conclusão

Usuário consegue salvar a própria criação.

------------------------------------------------------------------------

## Fase 11 --- Polish

### Tarefas

-   [ ] motion;
-   [ ] loading;
-   [ ] skeleton;
-   [ ] microinterações;
-   [ ] estados de erro;
-   [ ] acessibilidade;
-   [ ] performance;
-   [ ] mobile;
-   [ ] testes cross-browser;
-   [ ] Lighthouse;
-   [ ] compressão final dos assets.

------------------------------------------------------------------------

## Fase 12 --- Features futuras

Não implementar antes do MVP.

-   [ ] Randomize / Surprise Me;
-   [ ] Undo/Redo;
-   [ ] compartilhamento por URL;
-   [ ] galeria de criações;
-   [ ] mais patterns;
-   [ ] mais acabamentos;
-   [ ] animações avançadas;
-   [ ] background gerado por IA;
-   [ ] screenshots sociais;
-   [ ] presets especiais.

------------------------------------------------------------------------

# Estrutura sugerida de pastas

``` text
src/
├── assets/
│   ├── models/
│   ├── textures/
│   └── images/
│
├── components/
│   ├── ui/
│   ├── configurator/
│   └── layout/
│
├── features/
│   ├── can/
│   ├── branding/
│   ├── top/
│   ├── flavor/
│   ├── art/
│   └── export/
│
├── three/
│   ├── CanModel.tsx
│   ├── Scene.tsx
│   ├── Lighting.tsx
│   ├── Camera.tsx
│   └── Environment.tsx
│
├── store/
│   └── canStore.ts
│
├── hooks/
├── utils/
├── styles/
├── types/
└── App.tsx
```

------------------------------------------------------------------------

# MVP --- definição final

O MVP só estará concluído quando for possível:

-   [ ] abrir o projeto;
-   [ ] visualizar uma lata 3D branca;
-   [ ] girar a lata;
-   [ ] selecionar tamanho;
-   [ ] mudar body;
-   [ ] mudar logo;
-   [ ] mudar tampa;
-   [ ] mudar lacre;
-   [ ] ligar/desligar logo do lacre;
-   [ ] selecionar acabamento;
-   [ ] selecionar um flavor/preset;
-   [ ] perceber o cenário reagindo às cores;
-   [ ] visualizar o resultado final;
-   [ ] exportar um Product Shot;
-   [ ] usar a experiência em desktop e mobile.

**Qualquer feature além disso deve ser considerada secundária até o MVP
estar estável.**

------------------------------------------------------------------------

# Instruções para o Claude Code

## Regra principal

Não implementar o projeto inteiro de uma vez.

Trabalhar fase por fase seguindo este roadmap.

Antes de iniciar uma fase:

1.  ler este documento;
2.  identificar a fase atual;
3.  analisar o código existente;
4.  informar resumidamente o que será alterado;
5.  implementar apenas o necessário para aquela fase;
6.  testar;
7.  corrigir erros;
8.  atualizar o progresso deste documento.

## Regras técnicas

-   usar TypeScript;
-   evitar `any`;
-   componentes pequenos e reutilizáveis;
-   separar lógica 3D da UI;
-   não duplicar estado;
-   manter `CanConfiguration` como fonte central;
-   não hardcodar cores que deveriam vir de tokens/estado;
-   priorizar performance;
-   considerar mobile desde o início;
-   não adicionar bibliotecas sem necessidade;
-   não implementar IA no core;
-   não implementar features futuras antes do MVP;
-   documentar decisões técnicas relevantes;
-   preservar acessibilidade.

## Ao concluir cada fase

Atualizar:

``` text
Status: TODO → IN PROGRESS → DONE
```

E registrar:

``` text
### Development Log

Data:
Fase:
Implementado:
Arquivos principais:
Decisões:
Pendências:
Próximo passo:
```

------------------------------------------------------------------------

# Definition of Done

O projeto final deve demonstrar claramente:

-   UX;
-   UI;
-   Design System;
-   interação;
-   motion;
-   3D;
-   React;
-   TypeScript;
-   arquitetura de front-end;
-   responsividade;
-   acessibilidade;
-   performance;
-   exportação;
-   atenção aos detalhes.

O resultado deve parecer uma **experiência real de customização de
produto**, e não apenas uma landing page com um modelo 3D.

------------------------------------------------------------------------

## Aviso do projeto

Incluir no site/case:

> Concept project created for portfolio and educational purposes. Not
> affiliated with or endorsed by Monster Energy.

O uso da identidade da Monster deve ser apresentado como estudo
conceitual/não oficial.
