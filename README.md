# wpp-bot

Bot para WhatsApp baseado no [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys), escrito em TypeScript e com arquitetura modular para adicionar/remover funcionalidades em tempo real.

## Requisitos

- Node.js 18 ou superior (ESM nativo e `fetch`)
- Conta WhatsApp válida (número real que fará o pareamento)
- Dependências instaladas com `npm install`

As credenciais da sessão ficam no diretório `auth_info/`. Preserve essa pasta após o primeiro pareamento.

## Comandos principais

```bash
# instalar dependências
npm install

# desenvolvimento: recarrega automaticamente (watch) e mantém a sessão ativa
npm run dev

# build para produção na pasta dist/
npm run build

# executar build compilado
npm start

# envio manual de mensagem (usa mesma sessão do bot)
npm run send -- <numero-ou-jid> "mensagem a enviar"
```

### Reload sem reiniciar o processo

As funcionalidades do bot moram em `src/feature-definitions.ts`. Sempre que você alterar esse arquivo enquanto o `npm run dev` estiver rodando:

1. O watcher do arquivo dispara um reload dinâmico (sem reiniciar o processo nem perder a sessão).
2. As entradas mudadas são removidas/adicionadas automaticamente no registro de funcionalidades.

Isso permite iterar em respostas, menus e fluxos sem precisar “renderizar” novamente ou refazer o pareamento com o WhatsApp.

Alterações em outros arquivos TypeScript provocam restart automático do processo via `tsx watch`.

### Logs automáticos para número padrão

O bot encaminha cada mensagem recebida **e enviada** para o JID definido em `BOT_LOG_JID` (ou, caso ausente, utiliza `BOT_TEST_JID` e finalmente `5527995260672@s.whatsapp.net`). Ao iniciar, ele também dispara `STARTUP_LOG_MESSAGE` para o mesmo destinatário. O log inclui remetente/destino mascarados, nome (quando disponível) e o conteúdo envolvido.

### Personalizando o fluxo de atendimento

Os textos e opções do atendimento automatizado ficam concentrados em `src/conversation/manager.ts`. Ajuste o `DEFAULT_CONFIG` ou injete um `conversationConfig` ao instanciar o `Bot` para adaptar mensagens (ex.: `initialMessage`, `askPlate`, `urgentPhones`), URLs e contatos sem mexer na lógica da máquina de estados.

## Estrutura do projeto

- `src/bot.ts`: classe `Bot`, responsável por conexão, QR Code, backoff e dispatch das funcionalidades.
- `src/features.ts`: registro (`FeatureRegistry`) com métodos `set`, `get`, `delete` e o contexto de mensagens.
- `src/feature-loader.ts`: orquestra o carregamento e o hot reload das funcionalidades.
- `src/feature-definitions.ts`: funcionalidades padrão (`hello`, `menu`). Altere aqui para criar novos comandos em tempo real.
- `src/logger.ts`: utilitário de logs coloridos com mascaramento de JIDs.
- `src/conversation/manager.ts`: máquina de estados do atendimento (placa → km → opções), com textos configuráveis.
- `src/whatsapp.ts`: criação/configuração do socket Baileys e helpers de sessão.
- `src/utils/`: funções utilitárias (`jid` e `format`) usadas em diversos pontos.
- `src/send.ts`: script CLI para envio manual de mensagens pela mesma sessão.
- `src/main.ts`: expõe `onReceberMensagem`, útil para simular o fluxo de conversa programaticamente.

## Fluxo de uso

1. Rode `npm run dev`.
2. Escaneie o QR Code impresso no terminal (WhatsApp → Aparelhos conectados).
3. Espere o log `✅ Bot conectado`. Um auto-teste envia mensagem para o próprio número configurado.
4. Assim que conecta, o bot envia apenas `confiaVeiculos` no grupo “WppBot” (ou no JID configurado) e zera qualquer estado de conversa anterior. A partir daí:
   - Digite `1` para receber os telefones fictícios de atendimento urgente;
   - Digite `2` para iniciar o fluxo de manutenção preventiva (o bot pedirá placa e, depois, quilometragem);
   - Após qualquer atendimento, responda `SIM` para voltar ao menu ou `NÃO` para encerrar;
   - Envie `reiniciar` para recomeçar imediatamente.

### Depurando sem conectar ao WhatsApp

Use `onReceberMensagem` para testar o atendimento diretamente no código:

```ts
import { onReceberMensagem } from './src/main.js'

await onReceberMensagem('2')
// => ['Por favor, informe a placa do veículo (ex: ABC1D23).']

await onReceberMensagem(['ABC1D23', '45000'])
// => ['Agora, informe a quilometragem atual...', 'Perfeito! Registramos o veículo ABC1D23...', 'Deseja continuar o atendimento?...']

await onReceberMensagem('sim')
// => ['Como podemos ajudar hoje? ...']
```

O estado da conversa é mantido entre chamadas para o mesmo JID (por padrão `debug@s.whatsapp.net`).

## Manutenção e cuidados

- **backup de sessão:** mantenha `auth_info/` fora do versionamento (`.gitignore`) e não compartilhe.
- **reautorização:** se o QR parar de aparecer ou a sessão expirar, delete `auth_info/` com o bot parado e pareie novamente.
- **atualização do Baileys:** execute `npm install @whiskeysockets/baileys@latest` (verifique breaking changes).
- **logs:** todos os eventos são exibidos no terminal com horários e números mascarados.

## Troubleshooting

- **`tsc: not found`** – instale as dependências (`npm install`) antes de `npm run build`.
- **Sessão desconectada (`loggedOut`)** – remova `auth_info/` e refaça o pareamento.
- **Mensagens não chegam** – confirme DDI/DDD do número, conectividade do aparelho e permissões do WhatsApp.
