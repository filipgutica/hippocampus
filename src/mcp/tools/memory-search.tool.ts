import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemorySearchTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-search',
    {
      description:
        'Use when a likely durable preference, convention, or stable project fact may affect the next action. Scope must be explicit, queries should stay narrow, and v1 matching uses exact normalized subject matching when a subject is provided.',
      inputSchema: {
        scope: z.object({
          type: z.enum(['user', 'repo', 'org']),
          id: z.string().min(1),
        }),
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
