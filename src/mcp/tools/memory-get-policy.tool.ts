import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetPolicyTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get-policy',
    {
      description: 'Return the current effective memory policy and guidance artifact path.',
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(memoryService.getPolicy(), null, 2) }],
      structuredContent: memoryService.getPolicy(),
    }),
  )
}
