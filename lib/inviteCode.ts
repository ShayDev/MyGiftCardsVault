import { customAlphabet } from 'nanoid'

// Crockford's Base32: excludes I, L, O, U to avoid confusion with 1 and 0, and accidental words.
export const generateInviteCode = customAlphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 12)
