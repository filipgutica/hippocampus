import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryGetTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-get',
    {
      description: normalizeWhitespace(`
        Inspect a specific memory by id after discovery
        through search, list, or history. Use this for audit
        or debugging of a known record, including non-active
        memories. If the memory was superseded, the direct
        replacement appears as \`supersededByMemory\`.
      `),
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
