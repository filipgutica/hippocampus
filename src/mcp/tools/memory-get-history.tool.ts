import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetHistoryTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get-history',
    {
      description: normalizeWhitespace(`
        Audit how a known memory changed over time after
        you already have its id. Use this for provenance,
        reinforcement, contradiction, deletion, and later
        archival history, not for normal task retrieval.
      `),
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
