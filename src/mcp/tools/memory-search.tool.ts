import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { MEMORY_TYPES } from '../../memory/memory.types.js'
import { mcpScopeSchema } from './scope.schema.js'

export const registerMemorySearchTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-search',
    {
      description: normalizeWhitespace(`
        Default retrieval tool for one explicit scope.
        Use when a durable preference, convention, workflow,
        or project fact may change the next action. This is
        a query-based tool, so always provide \`subject\`.
        For broader recall across a class of memories, use
        \`memory-list\` with scope plus type. Normal results
        only include active memories. Search uses exact
        subject matching plus FTS retrieval within the scope.
      `),
      inputSchema: {
        scope: mcpScopeSchema,
        type: z.enum(MEMORY_TYPES).optional(),
        subject: z.string().min(1),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async input => {
      const result = await memoryService.searchMemories({
        scope: input.scope,
        type: input.type ?? null,
        subject: input.subject,
        limit: input.limit ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
