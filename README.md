# Ritmo 

Progressive Web App (PWA) pessoal de planejamento e gestão de rotina baseado em **turnos** (`Manhã`, `Tarde` e `Noite`) com **compensação inteligente de compromissos** e controle de metas semanais.

---

## Visão Geral

Diferente de agendas baseadas exclusivamente em horários rígidos, o **Ritmo** organiza a rotina em três blocos diários e concentra-se em preservar a intenção semanal do usuário diante de imprevistos. Quando um compromisso não é realizado, o motor de compensação avalia turnos livres futuros ou realocações possíveis dentro das restrições configuradas para cada categoria, mantendo histórico rastreável e reversível.

### Principais Funcionalidades

- **Agenda por Turnos (`Dia`, `Semana` e `Mês`):**
  - Grade fixa de 3 turnos por dia (`Manhã`, `Tarde`, `Noite`), com limite de um compromisso ativo por slot.
  - Visualização mensal com posicionamento vertical fixo por turno e resumo dinâmico dos dias com atividades.
  - Criação, edição, conclusão, marcação de não realizado e realocação rápida por toque/clique.
- **Motor de Compensação (`CompensationEngine`):**
  - Busca determinística de turnos compatíveis dentro de uma janela configurável de dias.
  - Suporte a realocação direta ou em cascata controlada, respeitando turnos permitidos, prioridade global e flag de realocabilidade da categoria.
  - Registro auditável de cada operação (`before`, `after`, `operation_id`, motivo e timestamp), com idempotência e proteção contra sobrescrita de edições posteriores ao desfazer (`rollback`).
- **Recorrências:**
  - Geração sob demanda de séries diárias, semanais (por dias da semana) e mensais.
  - Suporte a edição de regra, exclusão de ocorrência isolada (com supressão para evitar recriação) ou remoção da série completa.
- **Categorias e Metas Semanais:**
  - Configuração de cor, turnos permitidos, meta semanal, realocabilidade e ordem de prioridade/sacrifício.
  - Acompanhamento de progresso semanal por categoria.
- **Offline-First e Portabilidade:**
  - Funcionamento offline via Service Worker (`sw.js`) e persistência local sem dependência de servidor externo.
  - Exportação e importação de backup em JSON com validação estrutural.

---

## Arquitetura e Implementação

O projeto foi construído em **JavaScript ES Modules (Vanilla)**, **HTML5** e **CSS3** com tokens semânticos (`variables.css`), sem frameworks externos.

```text
ritmo-planner/
├── index.html                        # Entry point e estrutura semântica das views
├── manifest.json                     # Metadados de instalação PWA
├── sw.js                             # Service Worker (cache offline versionado)
├── css/
│   ├── variables.css                 # Tokens de tema (dark/light), tipografia e espaçamento
│   ├── base.css                      # Reset e estilos base
│   ├── layout.css                    # Estrutura responsiva, header e navegação
│   └── components.css                # Cards, grades de turno/mês, modais e controles
├── js/
│   ├── app.js                        # Orquestração de estado, navegação e ciclo de vida
│   ├── domain/
│   │   ├── entities.js               # Modelos, constantes de status/turnos e fábricas
│   │   └── DateUtils.js              # Manipulação de datas ISO, janelas temporais e validações
│   ├── repositories/
│   │   ├── StorageRepository.js      # Contrato da camada de persistência
│   │   └── LocalStorageAdapter.js    # Persistência local com commits atômicos e validação de importação
│   ├── services/
│   │   ├── CompensationEngine.js     # Planejamento, execução idempotente e rollback de compensações
│   │   ├── RecurrenceService.js      # Expansão de recorrências e controle de unicidade por slot
│   │   ├── StatusLifecycleService.js # Sincronização temporal de status de eventos
│   │   └── SeedService.js            # Inicialização limpa sem dados predefinidos
│   └── ui/
│       ├── AgendaView.js             # Views Dia, Semana e Mês + modais de ação rápida
│       ├── CompensationsView.js      # Revisão, confirmação e desfazer compensações
│       ├── RecurrencesView.js        # Gestão de rotinas recorrentes
│       ├── SettingsView.js           # Categorias, prioridades, tema e backup JSON
│       ├── ModalManager.js           # Controle de modais, foco e bloqueio de scroll
│       └── ToastManager.js           # Notificações não intrusivas com ação de desfazer
├── tests/
│   └── audit.test.mjs                # Testes unitários e de integração (node:test)
└── archive/                          # Arquivos legados preservados fora do fluxo ativo
```

### Decisões Técnicas Relevantes

- **Unicidade de Slot:** Toda inserção ou atualização passa por validação centralizada (`isSlotOccupying`), garantindo que não existam dois compromissos ativos incompatíveis no mesmo `(date, shift)`.
- **Persistência Atômica:** Operações que alteram múltiplas coleções (`events` e `compensation_logs`) executam via `commitAtomic`, mantendo snapshot prévio para restauração em caso de falha de escrita ou `QuotaExceededError`.
- **Integridade Temporal:** Eventos futuros não são marcados automaticamente como realizados ou não realizados; a transição automática ocorre apenas após o término da janela do compromisso.
- **Segurança na Renderização:** Conteúdos dinâmicos inseridos em templates HTML passam por sanitização/escape e validação de cores hexadecimais.

---

## Execução Local e Testes

Por utilizar ES Modules nativos, o aplicativo deve ser servido via HTTP local (não diretamente via `file://`):

```bash
# Exemplo com Python
python3 -m http.server 8080

# Ou com Node.js
npx serve .
```

Para executar a suíte de testes automatizados (requer Node.js 18+):

```bash
node --test tests/audit.test.mjs
```