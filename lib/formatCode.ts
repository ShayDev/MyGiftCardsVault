export function formatCode(raw: string): string {
  const sep = raw.includes('-') ? '·' : '-'
  const chars = raw.replace(/[-\s·]/g, '')
  const chunks: string[] = []
  for (let i = 0; i < chars.length; i += 4) chunks.push(chars.slice(i, i + 4))
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) {
    const last = chunks.pop()!
    const prev = chunks.pop()!
    const combined = prev + last
    if (combined.length <= 5) {
      chunks.push(combined)
    } else {
      const half = Math.floor(combined.length / 2)
      chunks.push(combined.slice(0, half), combined.slice(half))
    }
  }
  return chunks.join(sep)
}
