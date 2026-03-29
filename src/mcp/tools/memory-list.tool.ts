import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryListTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-list',
    {
      description: 'List active memories within a specific scope.',
      inputSchema: {
        scope: z.object({
          type: z.enum(['user', 'repo', 'org']),
          id: z.string().min(1),
        }),
        kind: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async input => {
      const result = memoryService.listMemories({
        scope: input.scope,
        kind: input.kind ?? null,
        limit: input.limit ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
