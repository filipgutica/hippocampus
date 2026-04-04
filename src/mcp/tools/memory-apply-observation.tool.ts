import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { MEMORY_ORIGINS, MEMORY_TYPES } from '../../memory/memory.types.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemoryApplyObservationTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-apply-observation',
    {
      description: normalizeWhitespace(`
        Save one durable scoped memory. If you have not
        loaded Hippocampus guidance this session, call
        \`memory-get-policy\` first. Use this for stable
        preferences, conventions, workflows, or project
        facts, not transient task state. \`observed_pattern\`
        starts as \`candidate\` and will not appear in normal
        search/list results until reinforced enough to
        promote.
      `),
      inputSchema: {
        scope: mcpScopeSchema,
        type: z.enum(MEMORY_TYPES),
        subject: z.string().min(1),
        statement: z.string().min(1),
        origin: z.enum(MEMORY_ORIGINS),
        details: z.string().optional(),
        source: z
          .object({
            channel: z.enum(['cli', 'mcp']),
            agent: z.string().optional(),
            runId: z.string().optional(),
          })
          .optional(),
      },
    },
    async input => {
      const result = memoryService.applyObservation({
        scope: input.scope,
        type: input.type,
        subject: input.subject,
        statement: input.statement,
        origin: input.origin,
        details: input.details ?? null,
        source: input.source ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
