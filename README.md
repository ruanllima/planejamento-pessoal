# ChronosShift — PWA de Agenda Adaptativa com Motor de Compensação Dinâmica

Aplicação Web Progressiva (PWA) mobile-first construída em **HTML5 semântico**, **CSS3 modular** e **JavaScript Vanilla (ES6+ Modules)** seguindo os princípios **SOLID** e preparada para migração direta para **Supabase**.

## Como Executar Localmente
Como o projeto utiliza módulos ES6 (`type="module"`) e Service Worker (`sw.js`), sirva a pasta por qualquer servidor HTTP estático:
- **Python:** `python -m http.server 8080`
- **Node/NPX:** `npx serve .`
- **VS Code:** Extensão *Live Server*

Acesse `http://localhost:8080` no navegador ou instale como PWA no celular/desktop.

## Migração Futura para Supabase
Crie `js/repositories/SupabaseAdapter.js` estendendo `StorageRepository` (`js/repositories/StorageRepository.js`) e substitua `new LocalStorageAdapter()` em `js/app.js`. Todas as entidades já operam com `UUID v4`, timestamps `ISO 8601` e chaves estrangeiras explícitas.
