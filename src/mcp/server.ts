import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { MemoryService } from '../memory/memory.service.js'
import { registerMemoryApplyObservationTool } from './tools/memory-apply-observation.tool.js'
import { registerMemoryGetPolicyTool } from './tools/memory-get-policy.tool.js'
import { registerMemorySearchTool } from './tools/memory-search.tool.js'

export const createMcpServer = (memoryService: MemoryService) => {
  const server = new McpServer({
    name: 'Hippocampus',
    version: '0.1.0',
  })

  registerMemoryGetPolicyTool(server, memoryService)
  registerMemorySearchTool(server, memoryService)
  registerMemoryApplyObservationTool(server, memoryService)

  return {
    server,
    start: async () => {
      const transport = new StdioServerTransport()
      await server.connect(transport)
    },
  }
}
