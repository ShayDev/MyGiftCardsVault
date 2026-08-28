// Lists every Gemini model your GEMINI_API_KEY can currently call generateContent
// on — useful when gemini-flash-latest (a rolling alias) is flaky and you want to
// try pinning diagnose-extract.ts's --gemini-model to a specific, more established
// version instead. Usage:
//   npx dotenv -e .env.local -o -- npx tsx scripts/list-gemini-models.ts
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

async function main() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  if (!res.ok) throw new Error(`Gemini models list failed: ${res.status} ${await res.text()}`)
  const data = await res.json()

  const flashModels = (data.models ?? [])
    .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
      m.name.includes('flash') && m.supportedGenerationMethods?.includes('generateContent')
    )
    .map((m: { name: string }) => m.name.replace('models/', ''))

  console.log('Flash models available to this API key (pass to --gemini-model without the "models/" prefix):\n')
  for (const name of flashModels) console.log(' ', name)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
