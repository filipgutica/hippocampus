import { z } from 'zod'

export const mcpScopeSchema = z.object({
  type: z.enum(['user', 'repo', 'org']),
  id: z
    .string()
    .min(1)
    .describe('For `repo`, use the canonical absolute path to the repo root with symlinks resolved.'),
})
