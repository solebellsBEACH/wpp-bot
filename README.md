# wpp-bot

Bot para WhatsApp baseado no [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys), com fluxo de atendimento simples e script auxiliar para envio manual de mensagens.

## Requisitos
- Node.js 18 ou superior (necessário suporte a módulos ES e `fetch`)
- Conta WhatsApp válida (número real que receberá o pareamento)
- Dependências instaladas via `npm install`

## Configuração inicial

```bash
npm install
```

As credenciais de sessão ficam em `auth_info/`. Após o pareamento, preserve essa pasta para evitar ter que autenticar novamente.

## Executando o bot principal

```bash
node index.js
```

1. Escaneie o QR Code no terminal com o aplicativo WhatsApp (Menu → Aparelhos conectados).
2. Aguarde o log `Bot conectado`. A partir daí:
   - O bot responde `👋 Hello, world!` a qualquer mensagem que contenha apenas `hello` (minúsculo).
   - Novas mensagens recebidas e enviadas são logadas com hora e mascaramento básico do número.
3. A sessão se mantém ativa até que o processo seja encerrado. Caso precise reconectar, o bot tenta automaticamente com backoff exponencial.

## Enviando uma mensagem manual

```bash
node send.js <numero-ou-jid> "mensagem a enviar"
```

- `<numero-ou-jid>` pode ser um número com DDI/DDD (`5527999...`) ou um JID completo (`5527999...@s.whatsapp.net`). Se omitido, usa o destinatário padrão configurado no script.
- A primeira execução também solicitará o pareamento (QR code), caso a sessão ainda não esteja autorizada.
- Ao final, o terminal confirma o envio com o número mascarado.

## Dicas e manutenção
- Não compartilhe a pasta `auth_info/`. Ela contém as credenciais da sessão.
- Se o QR não aparecer ou a sessão expirar, apague `auth_info/` com o processo parado e execute novamente para reautorizar.
- Ajuste respostas automáticas em `index.js` dentro do listener `messages.upsert`.
- Atualize o Baileys, quando necessário, com `npm install @whiskeysockets/baileys@latest` (verifique possíveis breaking changes antes).

## Troubleshooting
- **Erro ao enviar mensagem / sessão não abre:** execute `node index.js` manualmente, espere terminar o pareamento, depois volte a rodar o script desejado.
- **Sessão desconectada pelo WhatsApp:** verifique os logs; se o motivo for `loggedOut`, limpe `auth_info/` e repita o pareamento.
- **Mensagens não chegam:** certifique-se de que o número destinatário está correto (inclua DDI/DDD) e que o aparelho destinatário possui WhatsApp ativo.
