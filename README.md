# Ritmo — Planejamento pessoal

Primeira fundação funcional do produto descrito no Prompt Master.

## Requisitos
- Node.js 20+
- npm

## Executar
```bash
npm install
npm run dev
```

## Validar build
```bash
npm run build
```

## O que já está implementado
- Aplicação React + TypeScript + Vite.
- Interface responsiva com foco mobile-first.
- Navegação entre semanas e meses.
- Calendário mensal dinâmico (42 células, datas reais e anos bissextos).
- Criação, edição e exclusão de compromissos.
- Categorias com cor, prioridade, meta semanal e proteção.
- Status de planejamento, realização, não realização e reorganização.
- Detecção de sobreposição de horários no mesmo dia.
- Indicadores básicos de horas planejadas, realizadas e pendentes.
- Acompanhamento de metas por categoria.
- Persistência local versionada no navegador.
- Exportação de backup JSON.

## Limites conhecidos desta primeira etapa
- Os dados permanecem neste navegador/dispositivo. Ainda não há autenticação, PostgreSQL ou sincronização Supabase.
- Recorrências, modelos semanais, exceções e motor de compensação ainda não foram implementados.
- A execução ainda é representada pelo status do bloco planejado; uma entidade independente de execução será necessária antes do motor de compensação.
- Blocos que atravessam a meia-noite ainda não são aceitos.
- Arquivar categoria mantém os compromissos históricos; exclusão física não é oferecida.
- Não há migração automática para nuvem nesta etapa.

## Decisões de modelagem
- Datas são armazenadas como `YYYY-MM-DD` (data civil local), não como timestamps UTC.
- Horários são armazenados como `HH:mm`.
- Identificadores são UUIDs.
- Categoria arquivada não é apagada, preservando referências históricas.
- O armazenamento local é um adaptador inicial, não uma arquitetura de sincronização.

## Próximas etapas de engenharia
1. Formalizar planejamento e execução como entidades independentes.
2. Implementar metas semanais e mensais com regras temporais explícitas.
3. Implementar recorrências e exceções sem materializar ou sobrescrever histórico indevidamente.
4. Construir o motor de compensação como módulo puro, com testes unitários.
5. Definir schema PostgreSQL, políticas RLS e autenticação Supabase.
6. Implementar migração local → nuvem com backup, contagem, validação e resolução explícita de divergências.
7. Expandir testes automatizados e acessibilidade WCAG 2.2 AA.

## Segurança e integridade
Não coloque `service_role` ou qualquer segredo privilegiado no frontend. A integração Supabase deverá usar chave publicável/anon e políticas RLS estritas. Antes de habilitar migração ou sincronização, implemente cópia de segurança e reconciliação de dados.
