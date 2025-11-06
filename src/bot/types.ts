export interface BotHooks {
  onQrCode?: (qr: string) => void
  onConnectionOpen?: (jid: string) => void
  onConnectionClose?: (reason: { status?: number; message: string }) => void
}
