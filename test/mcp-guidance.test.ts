import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app/build-app.js'
import {
  memoryScopeGuidanceResource,
  runtimeMemoryPolicyResource,
} from '../src/guidance/guidance-catalog.js'
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
      const runtimeResource = resources.resources.find(item => item.uri === runtimeMemoryPolicyResource.resourceUri)
      const scopeResource = resources.resources.find(item => item.uri === memoryScopeGuidanceResource.resourceUri)

      expect(runtimeResource).toBeDefined()
      expect(runtimeResource?.title).toBe(runtimeMemoryPolicyResource.title)
      expect(runtimeResource?.description).toBe(runtimeMemoryPolicyResource.description)
      expect(runtimeResource?.mimeType).toBe(runtimeMemoryPolicyResource.mimeType)
      expect(scopeResource).toBeDefined()
      expect(scopeResource?.title).toBe(memoryScopeGuidanceResource.title)
      expect(scopeResource?.description).toBe(memoryScopeGuidanceResource.description)
      expect(scopeResource?.mimeType).toBe(memoryScopeGuidanceResource.mimeType)

      const runtimeRead = await client.readResource({ uri: runtimeMemoryPolicyResource.resourceUri })
      expect(runtimeRead.contents[0]?.uri).toBe(runtimeMemoryPolicyResource.resourceUri)
      expect(runtimeRead.contents[0]).toMatchObject({
        uri: runtimeMemoryPolicyResource.resourceUri,
        mimeType: runtimeMemoryPolicyResource.mimeType,
      })
      expect(runtimeRead.contents[0] && 'text' in runtimeRead.contents[0] ? runtimeRead.contents[0].text : '').toContain(
        '# Hippocampus Runtime Memory Policy',
      )

      const read = await client.readResource({ uri: memoryScopeGuidanceResource.resourceUri })
      expect(read.contents[0]?.uri).toBe(memoryScopeGuidanceResource.resourceUri)
      expect(read.contents[0]).toMatchObject({
        uri: memoryScopeGuidanceResource.resourceUri,
        mimeType: memoryScopeGuidanceResource.mimeType,
      })
      expect(read.contents[0] && 'text' in read.contents[0] ? read.contents[0].text : '').toContain(
        '# Hippocampus Memory Scope Guidance',
      )

      const policyResult = await client.callTool({
        name: 'memory-get-policy',
      })
      const policyText = getFirstTextContent(policyResult.content)
      const policy = JSON.parse(policyText) as {
        guidanceResourceUri: string
        guidanceArtifact: string
        canonicalPolicy: { uri: string; artifact: string; title: string }
        supportingGuidance: Array<{ uri: string; artifact: string; title: string }>
        resources: Array<{ role: string; uri: string; artifact: string; title: string }>
      }

      expect(policy.guidanceResourceUri).toBe(runtimeMemoryPolicyResource.resourceUri)
      expect(policy.guidanceArtifact).toBe(runtimeMemoryPolicyResource.artifact)
      expect(policy.canonicalPolicy).toEqual({
        uri: runtimeMemoryPolicyResource.resourceUri,
        artifact: runtimeMemoryPolicyResource.artifact,
        title: runtimeMemoryPolicyResource.title,
      })
      expect(policy.supportingGuidance).toEqual([
        {
          uri: memoryScopeGuidanceResource.resourceUri,
          artifact: memoryScopeGuidanceResource.artifact,
          title: memoryScopeGuidanceResource.title,
        },
      ])
      expect(policy.resources).toEqual([
        {
          role: runtimeMemoryPolicyResource.role,
          uri: runtimeMemoryPolicyResource.resourceUri,
          artifact: runtimeMemoryPolicyResource.artifact,
          title: runtimeMemoryPolicyResource.title,
        },
        {
          role: memoryScopeGuidanceResource.role,
          uri: memoryScopeGuidanceResource.resourceUri,
          artifact: memoryScopeGuidanceResource.artifact,
          title: memoryScopeGuidanceResource.title,
        },
      ])

      const tools = await client.listTools()
      const searchTool = tools.tools.find(item => item.name === 'memory-search')
      const policyTool = tools.tools.find(item => item.name === 'memory-get-policy')
      expect(searchTool?.description).toContain('queries should stay narrow')
      expect(policyTool?.description).toContain('canonical runtime memory policy')

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
