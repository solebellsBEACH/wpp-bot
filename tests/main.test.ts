import { describe, expect, it } from 'vitest'
import { onReceberMensagem } from '../src/main.js'

describe('onReceberMensagem', () => {
  it('segue o fluxo de manutenção preventiva solicitando placa e quilometragem', async () => {
    const start = await onReceberMensagem('confiaVeiculos')
    expect(start.some((text) => text.includes('Como podemos ajudar hoje?'))).toBe(true)

    const selecionaManutencao = await onReceberMensagem('2')
    expect(selecionaManutencao.some((text) => text.includes('Por favor, informe a placa'))).toBe(true)

    const informaPlaca = await onReceberMensagem('ABC1D23')
    expect(informaPlaca.some((text) => text.includes('Agora, informe a quilometragem'))).toBe(true)

    const informaKm = await onReceberMensagem('45000')
    expect(informaKm.some((text) => text.includes('Registramos o veículo ABC1D23'))).toBe(true)
    expect(informaKm.some((text) => text.includes('Deseja continuar o atendimento'))).toBe(true)

    await onReceberMensagem('não')
  })

  it('retorna telefones para atendimento urgente', async () => {
    await onReceberMensagem('confiaVeiculos')
    const respostas = await onReceberMensagem('1')
    expect(respostas.some((text) => text.includes('Atendimento urgente acionado'))).toBe(true)
    expect(respostas.some((text) => text.includes('(27) 4002-8922'))).toBe(true)
    expect(respostas.some((text) => text.includes('(27) 98888-1234'))).toBe(true)

    await onReceberMensagem('não')
  })
})
