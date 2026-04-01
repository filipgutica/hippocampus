import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { MEMORY_TYPES } from '../../memory/types/memory.types.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemoryListTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-list',
    {
      description: normalizeWhitespace(`
        Inspect active memories already stored in one
        explicit scope for orientation, debugging, or broad
        recall by memory class. Use this when you want
        scope-plus-type browsing. Use \`memory-search\`
        when you have a specific subject query.
      `),
      inputSchema: {
        scope: mcpScopeSchema,
        type: z.enum(MEMORY_TYPES).optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async input => {
      const result = memoryService.listMemories({
        scope: input.scope,
        type: input.type ?? null,
        limit: input.limit ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
