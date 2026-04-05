import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { normalizeWhitespace } from '../../common/utils.js'
import type { MemoryService } from '../../memory/memory.service.js'
import { mcpProjectScopeSchema } from './scope.schema.js'

export const registerProjectEnsureTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    'project-ensure',
    {
      description: normalizeWhitespace(`
        Ensure the current project identity is available
        before seeding or searching project memories. Use
        this when a session needs a canonical project scope
        for the current repository root or another explicit
        project path.
      `),
      inputSchema: {
        scope: mcpProjectScopeSchema,
      },
    },
    async input => {
      const project = memoryService.ensureProject({
        path: input.scope.id,
      })
      const result = {
        project: {
          ...project,
          path: project.repoRoot,
          ensured: true,
        },
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )
}
