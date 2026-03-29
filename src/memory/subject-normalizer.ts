import { normalizeWhitespace } from '../common/utils.js'

export const normalizeSubject = (subject: string): string => normalizeWhitespace(subject).normalize('NFKC').toLowerCase()
