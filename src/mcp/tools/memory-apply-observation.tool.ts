import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MemoryService } from '../../memory/memory.service.js'

export const registerMemoryApplyObservationTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'memory-apply-observation',
    {
      description: 'Apply a structured observation to the memory workflow.',
      inputSchema: {
        scope: z.object({
          type: z.enum(['user', 'repo', 'org']),
          id: z.string().min(1),
        }),
        kind: z.string().min(1),
        subject: z.string().min(1),
        statement: z.string().min(1),
        details: z.string().optional(),
        source: z
          .object({
            channel: z.enum(['cli', 'mcp']),
            agent: z.string().optional(),
            runId: z.string().optional(),
          })
          .optional(),
      },
    },
    async input => {
      const result = memoryService.applyObservation({
        scope: input.scope,
        kind: input.kind,
        subject: input.subject,
        statement: input.statement,
        details: input.details ?? null,
        source: input.source ?? null,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
