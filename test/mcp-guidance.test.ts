import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { execFileSync } from 'node:child_process'
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

const initializeGitRepo = (repoRoot: string): void => {
  fs.mkdirSync(repoRoot, { recursive: true })
  execFileSync('git', ['init'], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
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

const getScopeIdDescription = (tool: { inputSchema?: unknown } | undefined): string => {
  if (!tool || !tool.inputSchema || typeof tool.inputSchema !== 'object' || !('properties' in tool.inputSchema)) {
    return ''
  }

  const properties = tool.inputSchema.properties
  if (!properties || typeof properties !== 'object' || !('scope' in properties)) {
    return ''
  }

  const scope = properties.scope
  if (!scope || typeof scope !== 'object' || !('properties' in scope)) {
    return ''
  }

  const scopeProperties = scope.properties
  if (!scopeProperties || typeof scopeProperties !== 'object' || !('id' in scopeProperties)) {
    return ''
  }

  const id = scopeProperties.id
  if (!id || typeof id !== 'object' || !('description' in id) || typeof id.description !== 'string') {
    return ''
  }

  return id.description
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('MCP guidance resource', () => {
  it('lists, reads, and aligns policy metadata', async () => {
    const home = createTempDir()
    const repoRoot = path.join(home, 'repo')
    initializeGitRepo(repoRoot)
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
        policyVersion: string
        description: string
        canonicalPolicy: { uri: string; artifact: string; title: string }
        supportingGuidance: Array<{ uri: string; artifact: string; title: string }>
        resources: Array<{ role: string; uri: string; artifact: string; title: string }>
      }

      expect(policy.policyVersion).toBe('5')
      expect(policy.description).toContain('Read the returned resource URIs')
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
      const contradictTool = tools.tools.find(item => item.name === 'memory-contradict')
      expect(searchTool?.description).toContain('Default retrieval tool')
      expect(searchTool?.description).toContain('always provide `subject`')
      expect(searchTool?.description).toContain('exact subject matching plus FTS retrieval')
      expect(getScopeIdDescription(searchTool)).toContain('durable project scope id returned by `project-ensure`')
      expect(policyTool?.description).toContain('Start here once per session')
      expect(policyTool?.description).toContain('resource pointers')
      expect(contradictTool?.description).toContain('First find the id with `memory-search` or `memory-list`')
      expect(contradictTool?.description).toContain('replacement may carry a different type')

      const ensuredProject = await client.callTool({
        name: 'project-ensure',
        arguments: {
          scope: { type: 'project', id: repoRoot },
        },
      })
      const ensuredProjectResult = JSON.parse(getFirstTextContent(ensuredProject.content)) as {
        project: { scope: { id: string } }
      }
      const projectScopeId = ensuredProjectResult.project.scope.id

      const searchResult = await client.callTool({
        name: 'memory-search',
        arguments: {
          scope: { type: 'project', id: projectScopeId },
          subject: 'prefer pnpm',
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
