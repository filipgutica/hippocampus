import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

// Kept for future admin/debug MCP profiles. The default MCP server intentionally
// does not register destructive memory deletion.
export const registerMemoryDeleteTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-delete',
    {
      description: 'Soft delete a stored memory by id.',
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async input => {
      const result = memoryService.deleteMemory({
        id: input.id,
        source: { channel: 'mcp' },
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
