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
server/index.ts      servidor Express e arquivos estáticos
server/api.ts        autenticação, API financeira e API administrativa
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

O Blueprint executa o bundle `dist/migrate.js` antes de iniciar o serviço. A migração cria as tabelas, índices e restrições necessárias. O processo também cria o primeiro proprietário quando `ADMIN_EMAIL` e `ADMIN_PASSWORD` ainda não existem na base.

A URL do banco deve ser configurada apenas no Render ou em um `.env` ignorado localmente. Nunca coloque credenciais no GitHub, no frontend, no README ou em logs.

## Segurança e limites atuais

O backend deriva `user_id` da sessão autenticada e aplica esse filtro em todas as operações financeiras do cliente. O painel administrativo exige papel apropriado. Contas inativas não conseguem iniciar nova sessão e suas sessões existentes são removidas quando o acesso é desativado.

A sessão usa cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. Senhas são armazenadas somente como hashes bcrypt. Os valores financeiros são persistidos em centavos no PostgreSQL e convertidos para reais apenas na API.

A primeira versão ainda não inclui recuperação de senha por e-mail, convites com envio de e-mail, exportação efetiva de arquivos, categorias personalizadas, recorrência automática ou Row-Level Security do PostgreSQL. Esses itens devem ser adicionados antes de ampliar a operação para uma base grande.

## Validação

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Antes de usar dados reais, valide pelo menos dois usuários distintos, incluindo leitura, edição e exclusão cruzadas, acesso sem autenticação, permissões administrativas e bloqueio de usuário inativo.
