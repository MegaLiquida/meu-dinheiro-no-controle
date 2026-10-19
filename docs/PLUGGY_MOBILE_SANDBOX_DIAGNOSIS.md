# Diagnóstico Pluggy: sandbox e mobile

## Evidências oficiais

- A Pluggy informa que o Connect Widget usa o ambiente de produção para conectores Live e Sandbox e que `includeSandbox: true` adiciona conectores Sandbox à seleção; a opção não restringe sozinha a lista ao conector de teste: https://docs.pluggy.ai/en/docs/connect-widget/environments
- As credenciais de sucesso do Sandbox são `user-ok`, `password-ok` e MFA `123456`, e pertencem ao conector Pluggy Bank: https://docs.pluggy.ai/en/docs/guides/sandbox
- A opção `allowFullscreen` controla o modo de exibição em telas pequenas; quando `false`, o Connect é exibido como modal em vez de tela cheia: https://docs.pluggy.ai/en/docs/connect-widget/environments
- `selectedConnectorId` permite, após o consentimento, seguir diretamente para o login do conector selecionado; `connectorIds` permite limitar a seleção: https://docs.pluggy.ai/en/docs/connect-widget/environments
- Textos de consentimento podem ser personalizados pela Pluggy após validação, mas a documentação não oferece controle do espaçamento interno do widget: https://docs.pluggy.ai/en/docs/connect-widget/customization

## Diagnóstico observado

O Render está com `PLUGGY_INCLUDE_SANDBOX=true`. O widget exibe o modo demo e permite que uma conta de teste seja usada em um conector real. A Pluggy rejeita esse fluxo com a mensagem de que contas de teste só podem conectar conectores Sandbox. Para bancos reais, a conta Pluggy precisa de acesso à produção e due diligence aprovada.
