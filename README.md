# Meu Dinheiro no Controle

Aplicação web de organização financeira pessoal com ambiente do cliente e painel administrativo. A primeira versão funcional usa React no frontend, Express na API e PostgreSQL para persistência.

## O que já funciona

- Cadastro e login com sessão em cookie `HttpOnly`.
- Isolamento dos lançamentos pelo usuário autenticado.
- Cadastro, edição de status e exclusão de lançamentos.
- Dashboard com saldo atual, saldo projetado, próxima entrada e próximos vencimentos.
- Calendário mensal com marcação de lançamento pago.
- Simulador de compra parcelada calculado no backend.
- Onboarding guiado com renda, próxima entrada, saldo atual e margem de segurança.
- Centro de controle com alertas, comprometimento da renda e próximos passos.
- Contas e entradas recorrentes com geração de vencimentos futuros.
- Compras parceladas agrupadas com parcelas individuais e marcação de pagamento.
- Plano de dívidas com saldo, parcela, prioridade, negociação e quitação.
- Diagnóstico financeiro completo com frequência de renda, dependentes, compromissos, piso essencial e capacidade segura conservadora.
- Orçamento essencial editável por categoria, com ativação e exclusão de itens.
- Mapa de dívidas ampliado, completude de dados e priorização explicável sem presumir juros ou condições ausentes.
- Histórico de negociações com oferta, entrada, parcelas, encargos, validade, decisão e observações.
- Plano de recuperação protegido por capacidade: um plano acima do valor seguro não pode ser ativado.
- Pagamentos parciais com saldo anterior/posterior, quitação automática somente no saldo zero e estorno auditado.
- Revisão semanal e ações independentes, com estados aberto, adiado e resolvido.
- Visão mensal com planejado versus realizado, categorias, limites e metas.
- Simulador comparativo com diferentes prazos e menor saldo projetado.
- Central de notificações internas baseada em alertas financeiros reais.
- Troca segura de senha, exportação JSON completa e importação de lançamentos CSV com preview e idempotência por hash.
- Rate limiting de login e verificação de origem nas operações de escrita em produção.
- PWA instalável com manifesto, ícones, atalho de tela inicial e cache seguro do app shell.
- Painel administrativo protegido por papel (`support`, `admin` ou `owner`).
- Métricas reais de usuários e lançamentos.
- Consulta de clientes e detalhe dos lançamentos de cada conta.
- Desativação e reativação de usuários por administrador ou proprietário.
- Auditoria de login e alterações de status.
- Migração automática do schema no deploy do Render.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4 e CSS customizado para a identidade visual
- Express 4
- PostgreSQL via `pg`
- `bcryptjs` para hash de senhas
- `zod` para validação de payloads
- Node.js 22

## Estrutura principal

```text
client/              React, telas e cliente HTTP
client/public/       manifesto, ícones e service worker da PWA
server/index.ts      servidor Express e arquivos estáticos
server/api.ts        autenticação, API financeira e API administrativa
server/recovery.ts   diagnóstico, dívidas, negociação, plano, pagamentos e revisão semanal
server/auth.ts       sessões, cookies e autorização por papel
server/db.ts         pool PostgreSQL
server/migrations.ts schema inicial e migrações
server/domain.ts     saldo projetado e simulador
shared/              constantes compartilhadas
render.yaml          configuração do serviço no Render
```

## Rodar localmente

Instale Node 22 e pnpm 10. Depois:

```bash
pnpm install
cp .env.example .env
```

Preencha `DATABASE_URL` com uma conexão PostgreSQL de desenvolvimento. Não use a senha de produção em arquivos locais versionados. Para criar automaticamente o primeiro proprietário, preencha também:

```text
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD=uma-senha-com-ao-menos-8-caracteres
```

Inicie o modo de desenvolvimento:

```bash
pnpm dev
```

O Vite executa o frontend. Para executar a API compilada:

```bash
pnpm check
pnpm build
pnpm start
```

## Instalar como aplicativo (PWA)

Depois que o deploy estiver publicado em `https://meu-dinheiro-no-controle.onrender.com`, abra a URL pelo navegador do celular.

No Android com Chrome, aguarde o aviso **Leve seu controle com você** e toque em **instalar agora**. Também é possível abrir o menu do navegador e escolher **Instalar aplicativo** ou **Adicionar à tela inicial**.

No iPhone ou iPad, abra pelo Safari, toque em **Compartilhar**, escolha **Adicionar à Tela de Início** e confirme. O iOS não exibe o mesmo botão automático do Chrome, por isso a própria aplicação mostra essa orientação.

A PWA usa `display: standalone`, ícones próprios e uma tela inicial cacheada. O service worker não armazena respostas de `/api` e não mantém dados financeiros offline; as consultas autenticadas continuam protegidas pelo backend do Render.

A API estará disponível no mesmo host do frontend:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET/POST /api/launches`
- `PATCH/DELETE /api/launches/:id`
- `POST /api/simulate`
- `GET/PUT /api/profile`
- `GET/PUT /api/diagnosis`
- `GET/POST/PATCH/DELETE /api/essential-expenses`
- `GET/POST/PATCH /api/recurring`
- `GET/POST /api/purchases`
- `PATCH /api/purchase-installments/:id`
- `GET/POST/PATCH /api/debts`
- `GET/POST/PATCH /api/debts/:id/negotiations`
- `GET/POST/PATCH /api/recovery-plans`
- `POST /api/recovery-plans/:id/activate` e `/recalculate`
- `GET/POST /api/debts/:id/payments`
- `POST /api/debts/:id/payments/:paymentId/reverse`
- `GET/POST/PATCH /api/weekly-reviews`
- `GET/PATCH /api/actions`
- `GET /api/monthly?month=AAAA-MM`
- `POST/DELETE /api/budgets`
- `GET/POST/PATCH /api/goals`
- `GET/PATCH /api/notifications`
- `POST /api/auth/change-password`
- `GET /api/export`, `POST /api/import/csv/preview` e `POST /api/import/csv`
- `GET /api/admin/metrics`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id/status`
- `GET /api/admin/audit`

## Deploy no Render

O arquivo `render.yaml` foi preparado para o serviço web na branch `projeto`.

1. Crie ou abra o Web Service ligado ao repositório `MegaLiquida/meu-dinheiro-no-controle`.
2. Use a branch `projeto` ou altere o campo `branch` do Blueprint se a branch for renomeada.
3. Configure no ambiente do serviço:
   - `DATABASE_URL`: URL privada do PostgreSQL existente no Render.
   - `ADMIN_NAME`: nome do primeiro proprietário.
   - `ADMIN_EMAIL`: e-mail do primeiro proprietário.
   - `ADMIN_PASSWORD`: senha inicial do primeiro proprietário.
4. Faça o deploy pelo Blueprint ou sincronize o `render.yaml`.
5. Verifique `https://SEU_SERVICO.onrender.com/api/health`. A resposta esperada é `{"ok":true,"database":"connected"}`.

O Blueprint executa o bundle `dist/migrate.js` antes de iniciar o serviço. As migrações versionadas criam as tabelas, índices e restrições de perfis, planejamento, compras, dívidas, despesas essenciais, negociações, planos de recuperação, pagamentos, revisões, ações, limites, metas, importações e notificações. O processo também cria o primeiro proprietário quando `ADMIN_EMAIL` e `ADMIN_PASSWORD` ainda não existem na base.

A URL do banco deve ser configurada apenas no Render ou em um `.env` ignorado localmente. Nunca coloque credenciais no GitHub, no frontend, no README ou em logs.

## Segurança e limites atuais

O backend deriva `user_id` da sessão autenticada e aplica esse filtro em todas as operações financeiras do cliente. O painel administrativo exige papel apropriado. Contas inativas não conseguem iniciar nova sessão e suas sessões existentes são removidas quando o acesso é desativado.

A sessão usa cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. Senhas são armazenadas somente como hashes bcrypt. Os valores financeiros são persistidos em centavos no PostgreSQL e convertidos para reais apenas na API.

O produto já inclui troca de senha autenticada, exportação JSON completa, importação CSV idempotente, categorias livres, recorrência automática, pagamentos de dívidas auditados e notificações internas. A capacidade segura é uma métrica operacional conservadora e **não representa mínimo existencial legal nem aconselhamento jurídico**. Recuperação de senha por e-mail, convites com envio de e-mail, integração bancária/Open Finance e Row-Level Security do PostgreSQL ainda dependem da escolha de provedores e devem ser ativados antes de uma operação pública em escala.

## Validação

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

O release de recuperação também deve ser validado em um PostgreSQL descartável, percorrendo diagnóstico, despesas essenciais, dívida, negociação, plano, pagamento, revisão semanal, importação idempotente e exportação. Antes de usar dados reais, valide pelo menos dois usuários distintos, incluindo leitura, edição e exclusão cruzadas, acesso sem autenticação, permissões administrativas e bloqueio de usuário inativo.
