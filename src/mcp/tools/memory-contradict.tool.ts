import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemoryContradictTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-contradict',
    {
      description: normalizeWhitespace(`
        Correct a stale or wrong memory by id. First find
        the id with \`memory-search\` or \`memory-list\`, then
        call this tool to suppress the old memory and create
        a new active replacement in the same scope and kind.
        The replacement subject may differ from the old
        subject when the durable topic itself has changed.
      `),
      inputSchema: {
        id: z.string().min(1),
        replacement: z.object({
          scope: mcpScopeSchema,
          kind: z.string().min(1),
          subject: z.string().min(1),
          statement: z.string().min(1),
          sourceType: z.enum(['explicit_user_statement', 'observed_pattern', 'tool_observation']),
          details: z.string().optional(),
        }),
      },
    },
    async input => {
      const result = memoryService.contradictMemory({
        id: input.id,
        replacement: {
          scope: input.replacement.scope,
          kind: input.replacement.kind,
          subject: input.replacement.subject,
          statement: input.replacement.statement,
          sourceType: input.replacement.sourceType,
          details: input.replacement.details ?? null,
        },
        source: { channel: 'mcp' },
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
