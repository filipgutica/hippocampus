import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryListTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-list',
    {
      description:
        'Use for orientation or debugging within an explicit scope. Prefer memory-search when a likely kind or subject is already known and broad fishing is unnecessary.',
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
