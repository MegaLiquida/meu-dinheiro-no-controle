# Open Finance — referências e decisão de segurança

**Data da análise:** 26 de setembro de 2026  
**Status:** fundação técnica publicada em preparação; nenhum provedor bancário real está ativado.

## Decisões adotadas

1. **Não capturar SMS, pop-ups ou notificações de bancos como fonte oficial de saldo.** Esses sinais podem ser incompletos, duplicados, atrasados ou adulterados pelo sistema operacional. Podem ser, no máximo, um recurso auxiliar futuro e sempre devem passar por revisão.
2. **Não pedir nem armazenar senha bancária.** A conexão deve ocorrer no ambiente oficial da instituição, através do consentimento Open Finance e do widget/deep link do provedor.
3. **Não alterar o saldo automaticamente sem conciliação.** Transações recebidas entram como `pending`; o usuário revisa e só então o sistema cria um lançamento financeiro.
4. **Deduplicar por identificador externo do provedor e conexão.** Atualizações da mesma transação não criam cópias.
5. **Responder rapidamente a webhooks e processar de forma assíncrona.** O handler futuro deve validar o evento, registrar uma chave idempotente e buscar os dados completos no provedor.

## Referências oficiais consultadas

- [Banco Central — Open Finance](https://www.bcb.gov.br/en/financialstability/open_finance) — o compartilhamento depende de consentimento livre, informado, prévio e inequívoco; o cliente pode revogar a autorização; os procedimentos devem respeitar a LGPD.
- [Pluggy — Open Finance Connectors](https://docs.pluggy.ai/en/docs/open-finance/overview) — oferece contas, transações, cartões, empréstimos e outros produtos em conectores Open Finance, com cobertura de instituições brasileiras; a disponibilidade depende do plano e do conector.
- [Pluggy — Creating an Item](https://docs.pluggy.ai/en/docs/open-finance/creating-item) — recomenda o Connect Widget para manter o fluxo de consentimento atualizado; o processo usa CPF/CNPJ e o redirecionamento oficial da instituição.
- [Pluggy — Webhook reference](https://docs.pluggy.ai/en/docs/developer-tools/webhooks-ref) — eventos de criação/atualização de item e transações; recomenda responder `2XX` rapidamente, processar depois e consultar o item completo; há retentativas documentadas.
- [Belvo — Banking Aggregation in Brazil](https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-introduction) — disponibiliza dados de contas, saldos, transações e faturas; explica a relação entre consentimento e link e disponibiliza widget hospedado e portal de gerenciamento de consentimento.
- [Belvo — Aggregation Webhooks](https://developers.belvo.com/developer_resources/resources-webhooks-aggregation) — documenta eventos de atualização histórica, novas transações e transações alteradas, além de retentativas e busca posterior dos dados completos.

## Escolha ainda pendente

A primeira integração real deve escolher **um único provedor** após comparar: instituições necessárias para o público brasileiro, cobertura de contas/cartões, widget web e mobile, eventos de atualização, limites operacionais, suporte a consentimento e custo. A escolha não deve ser inferida apenas pela documentação pública.

Até essa escolha, `GET /api/connections` informa que a seleção do provedor é necessária e a interface não apresenta um botão que simule uma conexão real.
