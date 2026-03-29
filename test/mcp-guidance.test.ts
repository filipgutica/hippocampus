import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app/build-app.js'
import { guidanceMimeType, guidanceResourceUri, guidanceTitle } from '../src/guidance/memory-scope-guidance.js'
import { createMcpServer } from '../src/mcp/server.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-mcp-guidance-test-'))
  tempDirs.push(dir)
  return dir
}

const getFirstTextContent = (value: unknown): string => {
  if (!Array.isArray(value) || value.length === 0) {
    return ''
  }

  const first = value[0]
  if (!first || typeof first !== 'object' || !('text' in first) || typeof first.text !== 'string') {
    return ''
  }

  return first.text
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('MCP guidance resource', () => {
  it('lists, reads, and aligns policy metadata', async () => {
    const home = createTempDir()
    const app = await buildApp({
      mode: 'runtime',
      allowLazyInit: true,
      appHomeOverride: home,
    })

    if (app.mode !== 'runtime') {
      throw new Error('Expected runtime app container.')
    }

    const mcp = createMcpServer(app.memoryService)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'hippo-test', version: '1.0.0' })

    try {
      await mcp.server.connect(serverTransport)
      await client.connect(clientTransport)

      const resources = await client.listResources()
      const resource = resources.resources.find(item => item.uri === guidanceResourceUri)

      expect(resource).toBeDefined()
      expect(resource?.title).toBe(guidanceTitle)
      expect(resource?.mimeType).toBe(guidanceMimeType)

      const read = await client.readResource({ uri: guidanceResourceUri })
      expect(read.contents[0]?.uri).toBe(guidanceResourceUri)
      expect(read.contents[0]).toMatchObject({
        uri: guidanceResourceUri,
        mimeType: guidanceMimeType,
      })
      expect(read.contents[0] && 'text' in read.contents[0] ? read.contents[0].text : '').toContain(
        '# Hippocampus Memory Scope Skill',
      )

      const policyResult = await client.callTool({
        name: 'memory-get-policy',
      })
      const policyText = getFirstTextContent(policyResult.content)
      const policy = JSON.parse(policyText) as { guidanceResourceUri: string }

      expect(policy.guidanceResourceUri).toBe(guidanceResourceUri)

      const tools = await client.listTools()
      expect(tools.tools.some(item => item.name === 'memory-search')).toBe(true)

      const searchResult = await client.callTool({
        name: 'memory-search',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          limit: 1,
        },
      })

      expect(getFirstTextContent(searchResult.content)).toContain('"items"')
    } finally {
      await client.close()
      await mcp.server.close()
      app.close()
    }
  })
})
