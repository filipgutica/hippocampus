import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetPolicyTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get-policy',
    {
      description:
        'Read this first to discover the canonical runtime memory policy, supporting guidance resources, and deterministic server-side acceptance, matching, and ranking semantics.',
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(memoryService.getPolicy(), null, 2) }],
      structuredContent: memoryService.getPolicy(),
    }),
  )
}
