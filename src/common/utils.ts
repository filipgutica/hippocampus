import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const normalizeWhitespace = (input: string) => input.trim().replace(/\s+/g, ' ')

export const normalizeSubjectKey = (input: string) => normalizeWhitespace(input).normalize('NFKC').toLowerCase()

export const canonicalizePath = (input: string) => path.resolve(input)

export const toFileUrl = (input: string) => pathToFileURL(input).href
