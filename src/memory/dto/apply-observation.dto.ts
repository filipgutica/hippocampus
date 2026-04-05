import { z } from 'zod'
import type { ScopeRef } from '../../common/types/scope-ref.js'
import { MEMORY_ORIGINS, MEMORY_TYPES } from '../memory.types.js'

const scopeRefSchema = z
  .object({
    type: z.enum(['user', 'project']),
    id: z.string().min(1),
  })
  .strict()

export const cliObservationSourceSchema = z
  .object({
    channel: z.literal('cli'),
  })
  .strict()

export const mcpObservationSourceSchema = z
  .object({
    channel: z.literal('mcp'),
    agent: z.enum(['codex', 'claude']),
    sessionId: z.string().min(1),
  })
  .strict()

export const observationSourceSchema = z.union([cliObservationSourceSchema, mcpObservationSourceSchema])

export const memoryDraftInputSchema = z
  .object({
    scope: scopeRefSchema,
    type: z.enum(MEMORY_TYPES),
    subject: z.string().min(1),
    statement: z.string().min(1),
    origin: z.enum(MEMORY_ORIGINS),
    details: z.string().nullable().optional(),
  })
  .strict()

export type ObservationSource = z.infer<typeof observationSourceSchema>

export type MemoryDraftInput = z.infer<typeof memoryDraftInputSchema> & {
  scope: ScopeRef
}

export type ApplyObservationInput = MemoryDraftInput & {
  source?: ObservationSource | null
}
