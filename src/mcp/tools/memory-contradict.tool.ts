import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryContradictTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-contradict',
    {
      description:
        'Contradict an existing memory by id, suppress it, and create a new active replacement in the same scope and kind. Use this when the old memory is no longer trustworthy and should point to updated state.',
      inputSchema: {
        id: z.string().min(1),
        replacement: z.object({
          scope: z.object({
            type: z.enum(['user', 'repo', 'org']),
            id: z.string().min(1),
          }),
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
