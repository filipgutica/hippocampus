import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get',
    {
      description: 'Inspect a known memory by id after discovery through search or list.',
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async input => {
      const result = memoryService.getMemory({ id: input.id })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
