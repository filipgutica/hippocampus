import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  memoryScopeGuidanceResource,
  readGuidanceArtifact,
} from '../../guidance/guidance-catalog.js'

export const registerMemoryScopeGuidanceResource = (server: McpServer): void => {
  server.registerResource(
    'memory-scope-guidance',
    memoryScopeGuidanceResource.resourceUri,
    {
      title: memoryScopeGuidanceResource.title,
      description: memoryScopeGuidanceResource.description,
      mimeType: memoryScopeGuidanceResource.mimeType,
    },
    async () => ({
      contents: [
        {
          uri: memoryScopeGuidanceResource.resourceUri,
          mimeType: memoryScopeGuidanceResource.mimeType,
          text: readGuidanceArtifact(memoryScopeGuidanceResource),
        },
      ],
    }),
  )
}
