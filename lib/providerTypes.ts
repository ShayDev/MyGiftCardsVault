export type ProviderType = 'CARD' | 'VOUCHER' | 'CLUB' | 'REFUND'

// `display` is what's rendered in the combobox and what gets submitted as the
// field value. `name`/`nameByCountry` are carried along purely so the client
// can search across both languages — a seeded row typically has only one of
// them equal to `display`, the other is the "other language" match target.
export type ProviderOption = {
  display: string
  name: string | null
  nameByCountry: string | null
}
