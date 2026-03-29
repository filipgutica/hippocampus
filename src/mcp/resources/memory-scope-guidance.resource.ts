import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  guidanceMimeType,
  guidanceResourceUri,
  guidanceTitle,
  readMemoryScopeGuidance,
} from '../../guidance/memory-scope-guidance.js'

export const registerMemoryScopeGuidanceResource = (server: McpServer): void => {
  server.registerResource(
    'memory-scope-guidance',
    guidanceResourceUri,
    {
      title: guidanceTitle,
      mimeType: guidanceMimeType,
    },
    async () => ({
      contents: [
        {
          uri: guidanceResourceUri,
          mimeType: guidanceMimeType,
          text: readMemoryScopeGuidance(),
        },
      ],
    }),
  )
}
