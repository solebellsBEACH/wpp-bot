export function formatKilometers(km?: string): string {
  if (!km) return ''
  const numeric = Number.parseInt(km, 10)
  if (Number.isNaN(numeric)) {
    return `${km} km`
  }
  return `${numeric.toLocaleString('pt-BR')} km`
}

