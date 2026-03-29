import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetPolicyTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get-policy',
    {
      description: normalizeWhitespace(`
        Start here once per session or when Hippocampus
        behavior is unclear. Returns the current policy
        summary plus canonical and supporting guidance
        resource pointers. Use the returned resource URIs
        for detailed runtime guidance.
      `),
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(memoryService.getPolicy(), null, 2) }],
      structuredContent: memoryService.getPolicy(),
    }),
  )
}
