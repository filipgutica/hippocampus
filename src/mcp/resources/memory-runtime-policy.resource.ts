import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  readGuidanceArtifact,
  runtimeMemoryPolicyResource,
} from '../../guidance/guidance-catalog.js'

export const registerMemoryRuntimePolicyResource = (server: McpServer): void => {
  server.registerResource(
    'memory-runtime-policy',
    runtimeMemoryPolicyResource.resourceUri,
    {
      title: runtimeMemoryPolicyResource.title,
      description: runtimeMemoryPolicyResource.description,
      mimeType: runtimeMemoryPolicyResource.mimeType,
    },
    async () => ({
      contents: [
        {
          uri: runtimeMemoryPolicyResource.resourceUri,
          mimeType: runtimeMemoryPolicyResource.mimeType,
          text: readGuidanceArtifact(runtimeMemoryPolicyResource),
        },
      ],
    }),
  )
}
