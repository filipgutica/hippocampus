import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemoryListTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-list',
    {
      description: normalizeWhitespace(`
        Inspect active memories already stored in one
        explicit scope for orientation or debugging. Do not
        use this as the normal retrieval path for task
        decisions; use \`memory-search\`, including
        scope-plus-kind queries for broad recall.
      `),
      inputSchema: {
        scope: mcpScopeSchema,
        kind: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async input => {
      const result = memoryService.listMemories({
        scope: input.scope,
        kind: input.kind ?? null,
        limit: input.limit ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
