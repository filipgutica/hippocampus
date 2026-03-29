import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetHistoryTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get-history',
    {
      description: 'Audit or debug how a known memory evolved over time. This is not the normal retrieval path for deciding the next action.',
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async input => {
      const result = memoryService.getMemoryHistory({ id: input.id })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
