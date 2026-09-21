# Meu Dinheiro no Controle

Protótipo web do **Meu Dinheiro no Controle**, com tela para clientes e painel administrativo para gestão de usuários, saúde financeira e lançamentos.

## Stack

- React + TypeScript + Vite
- Tailwind CSS 4 e CSS customizado para a identidade visual
- Express para servir os arquivos compilados em produção
- Armazenamento local no navegador nesta fase de protótipo
- Node.js 22

## Rodar localmente

```bash
pnpm install
pnpm dev
```

Para validar o build de produção:

```bash
pnpm check
pnpm build
pnpm start
```

A tela administrativa fica disponível em `/admin`.

## Publicar no GitHub

Crie um repositório vazio no GitHub e, na raiz deste projeto, execute:

```bash
git add .
git commit -m "feat: add admin management panel"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

Substitua a URL do `origin` pela URL real do repositório. O repositório deve permanecer privado se os dados reais de clientes forem adicionados antes da implementação de autenticação e controle de acesso.

## Deploy no Render

O arquivo `render.yaml` já contém a configuração do serviço web:

- **Runtime:** Node
- **Build:** `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- **Start:** `pnpm start`
- **Health check:** `/`
- **Deploy automático:** a cada commit na branch conectada

No Render, escolha **New > Blueprint** e conecte o repositório do GitHub. O Render detectará o `render.yaml` e criará o serviço. Alternativamente, crie um Web Service manualmente usando os mesmos comandos.

A aplicação usa `process.env.PORT`, portanto não é necessário definir uma porta fixa no Render.

## Próxima etapa de arquitetura

O protótipo ainda usa dados demonstrativos e `localStorage`. Para produção, o painel deve receber autenticação, banco de dados, auditoria de ações, permissões administrativas e armazenamento seguro de dados. Esses itens devem ser adicionados antes de cadastrar clientes reais.
