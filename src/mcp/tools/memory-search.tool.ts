import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemorySearchTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-search',
    {
      description: normalizeWhitespace(`
        Default retrieval tool for one explicit scope.
        Use when a durable preference, convention, workflow,
        or project fact may change the next action. Keep
        queries narrow with \`subject\` when possible; kind-only
        search is the broad-recall pattern when you need
        a class of memories. Normal results only include
        active memories.
      `),
      inputSchema: {
        scope: mcpScopeSchema,
        kind: z.string().min(1).optional(),
        subject: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async input => {
      const result = memoryService.searchMemories({
        scope: input.scope,
        kind: input.kind ?? null,
        subject: input.subject ?? null,
        limit: input.limit ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
