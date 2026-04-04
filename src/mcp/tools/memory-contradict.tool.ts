import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import { mcpObservationSourceSchema } from '../../memory/dto/apply-observation.dto.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { MEMORY_ORIGINS, MEMORY_TYPES } from '../../memory/memory.types.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemoryContradictTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-contradict',
    {
      description: normalizeWhitespace(`
        Correct a stale or wrong memory by id. First find
        the id with \`memory-search\` or \`memory-list\`, then
        call this tool to suppress the old memory and create
        a new active replacement in the same scope. The
        replacement may carry a different type when the
        durable topic itself has changed.
      `),
      inputSchema: {
        id: z.string().min(1),
        source: mcpObservationSourceSchema,
        replacement: z.object({
          scope: mcpScopeSchema,
          type: z.enum(MEMORY_TYPES),
          subject: z.string().min(1),
          statement: z.string().min(1),
          origin: z.enum(MEMORY_ORIGINS),
          details: z.string().optional(),
        }),
      },
    },
    async input => {
      const result = memoryService.contradictMemory({
        id: input.id,
        replacement: {
          scope: input.replacement.scope,
          type: input.replacement.type,
          subject: input.replacement.subject,
          statement: input.replacement.statement,
          origin: input.replacement.origin,
          details: input.replacement.details ?? null,
        },
        source: input.source,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
