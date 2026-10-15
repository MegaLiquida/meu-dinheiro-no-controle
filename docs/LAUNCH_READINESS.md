# Prontidão para lançamento piloto

## Objetivo

Liberar o **beta fechado** somente para poucos usuários convidados, com dados reais, suporte direto e capacidade de interromper o piloto rapidamente se houver risco de segurança ou perda de dados.

## Status atual

**Classificação:** beta fechado em preparação.

**Não liberar usuários externos ainda** enquanto os bloqueios P0 abaixo não estiverem confirmados.

## Gate P0 — obrigatório antes do primeiro convite

### Operação

- [ ] O deploy do Render conclui sem erro.
- [ ] `GET /api/health` retorna `{"ok":true,"database":"connected"}`.
- [ ] As migrações do PostgreSQL terminam com sucesso.
- [ ] O serviço reinicia e volta a responder depois de ficar ocioso.
- [ ] O domínio público e HTTPS estão funcionando.

### Credenciais e acesso

- [ ] Senha do PostgreSQL foi rotacionada depois da exposição em capturas.
- [ ] `ADMIN_PASSWORD` foi substituída por segredo forte e exclusivo.
- [ ] Nenhum segredo aparece no Git, logs, screenshots ou documentação.
- [ ] O acesso administrativo foi testado com uma conta separada da conta piloto.

### Isolamento entre usuários

- [ ] Dois usuários distintos foram criados.
- [ ] Cada usuário visualiza somente seus lançamentos, metas, dívidas, negociações, planos, pagamentos, notificações e exportações.
- [ ] IDs de registros de outro usuário retornam `404` ou resultado vazio, nunca os dados do registro.
- [ ] Um usuário não consegue alterar ou excluir registro de outro usuário.
- [ ] A exportação JSON não contém dados de outra conta.
- [ ] Um usuário inativo não consegue iniciar nova sessão.

### Dados e recuperação

- [ ] Backup do PostgreSQL foi criado antes do piloto.
- [ ] Uma restauração foi testada em banco separado.
- [ ] O procedimento de restauração está documentado e tem responsável.
- [ ] O script de backfill de `user_profiles` foi executado somente após o health check estar verde.

## Gate P1 — concluir durante o piloto

- [ ] Recuperação de senha por e-mail.
- [ ] Monitoramento de erro, disponibilidade e tempo de resposta.
- [ ] Teste de acessibilidade com teclado, contraste, foco e mensagens de erro.
- [ ] Revisão de linguagem com usuários não técnicos.
- [ ] Política de privacidade publicada.
- [ ] Termos de uso publicados.
- [ ] Canal de suporte definido e tempo de resposta combinado.
- [ ] Fluxo de exclusão de conta e dados definido.

## Gate P2 — antes de lançamento público

- [ ] Testes automatizados completos de isolamento entre usuários em banco PostgreSQL descartável.
- [ ] Teste de carga básico e limites de rate limiting revisados.
- [ ] Open Finance contratado, configurado e anunciado somente se estiver operacional.
- [ ] Plano de incidentes e comunicação aos usuários.
- [ ] Backup automatizado com restauração periódica comprovada.
- [ ] Revisão independente de segurança.

## Protocolo do beta fechado

- Convidar inicialmente de 5 a 10 pessoas.
- Manter o piloto por pelo menos 14 dias.
- Usar contas sem dados financeiros críticos no primeiro teste.
- Solicitar feedback após o cadastro, primeiro lançamento, primeira dívida e primeira revisão semanal.
- Registrar cada erro com passos para reproduzir, usuário afetado e impacto.
- Suspender novos convites diante de qualquer suspeita de vazamento entre contas, perda de dados ou falha de autenticação.
- Informar claramente que o produto está em beta e que os dados devem ser conferidos pelo usuário.

## Critério de decisão

O piloto pode começar quando todos os itens P0 estiverem marcados. O lançamento público deve aguardar a conclusão dos itens P1 e P2 que envolvem segurança, recuperação de conta, privacidade, backups e suporte.
