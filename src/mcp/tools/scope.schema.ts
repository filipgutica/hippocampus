import { z } from 'zod'

export const mcpScopeSchema = z.object({
  type: z.enum(['user', 'project']),
  id: z
    .string()
    .min(1)
    .describe('For `project`, use the durable project scope id returned by `project-ensure`.'),
})

export const mcpProjectScopeSchema = z.object({
  type: z.literal('project'),
  id: z
    .string()
    .min(1)
    .describe('Use the current repository root path or another explicit local project path to ensure a project scope id.'),
})
