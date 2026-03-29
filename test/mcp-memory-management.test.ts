import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app/build-app.js'
import { createMcpServer } from '../src/mcp/server.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-mcp-memory-test-'))
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

const getReplacementScopeIdDescription = (tool: { inputSchema?: unknown } | undefined): string => {
  if (!tool || !tool.inputSchema || typeof tool.inputSchema !== 'object' || !('properties' in tool.inputSchema)) {
    return ''
  }

  const properties = tool.inputSchema.properties
  if (!properties || typeof properties !== 'object' || !('replacement' in properties)) {
    return ''
  }

  const replacement = properties.replacement
  if (!replacement || typeof replacement !== 'object' || !('properties' in replacement)) {
    return ''
  }

  const replacementProperties = replacement.properties
  if (!replacementProperties || typeof replacementProperties !== 'object' || !('scope' in replacementProperties)) {
    return ''
  }

  const scope = replacementProperties.scope
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

describe('MCP memory management tools', () => {
  it('supports apply, contradiction, inspection, and keeps delete off the default MCP surface', async () => {
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
    const client = new Client({ name: 'hippo-memory-test', version: '1.0.0' })

    try {
      await mcp.server.connect(serverTransport)
      await client.connect(clientTransport)

      const tools = await client.listTools()
      const listTool = tools.tools.find(tool => tool.name === 'memory-list')
      const getTool = tools.tools.find(tool => tool.name === 'memory-get')
      const historyTool = tools.tools.find(tool => tool.name === 'memory-get-history')
      const applyTool = tools.tools.find(tool => tool.name === 'memory-apply-observation')
      const contradictTool = tools.tools.find(tool => tool.name === 'memory-contradict')
      const searchTool = tools.tools.find(tool => tool.name === 'memory-search')
      expect(listTool).toBeDefined()
      expect(getTool).toBeDefined()
      expect(historyTool).toBeDefined()
      expect(applyTool).toBeDefined()
      expect(contradictTool).toBeDefined()
      expect(searchTool?.description).toContain('kind-only search is the broad-recall pattern')
      expect(listTool?.description).toContain('orientation or debugging')
      expect(listTool?.description).toContain('Do not use this as the normal retrieval path')
      expect(getTool?.description).toContain('including non-active memories')
      expect(historyTool?.description).toContain('later archival history')
      expect(applyTool?.description).toContain('call `memory-get-policy` first')
      expect(applyTool?.description).toContain('will not appear in normal search/list results')
      expect(contradictTool?.description).toContain('First find the id with `memory-search` or `memory-list`')
      expect(getScopeIdDescription(searchTool)).toContain('canonical absolute path to the repo root')
      expect(getScopeIdDescription(listTool)).toContain('canonical absolute path to the repo root')
      expect(getScopeIdDescription(applyTool)).toContain('canonical absolute path to the repo root')
      expect(getReplacementScopeIdDescription(contradictTool)).toContain('canonical absolute path to the repo root')
      expect(tools.tools.some(tool => tool.name === 'memory-delete')).toBe(false)

      const applied = await client.callTool({
        name: 'memory-apply-observation',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          kind: 'preference',
          subject: 'Prefer pnpm',
          statement: 'Use pnpm for this repo.',
          sourceType: 'explicit_user_statement',
        },
      })
      const appliedResult = JSON.parse(getFirstTextContent(applied.content)) as { memory: { id: string } }
      const memoryId = appliedResult.memory.id

      const contradicted = await client.callTool({
        name: 'memory-contradict',
        arguments: {
          id: memoryId,
          replacement: {
            scope: { type: 'repo', id: '/tmp/example-repo' },
            kind: 'preference',
            subject: 'Prefer npm',
            statement: 'Use npm for this repo.',
            sourceType: 'explicit_user_statement',
          },
        },
      })
      const contradictedResult = JSON.parse(getFirstTextContent(contradicted.content)) as {
        replacementMemory: { id: string }
        contradictedMemory: { status: string; supersededBy: string }
      }
      const replacementMemoryId = contradictedResult.replacementMemory.id
      expect(contradictedResult.contradictedMemory.status).toBe('suppressed')
      expect(contradictedResult.contradictedMemory.supersededBy).toBe(replacementMemoryId)

      const listed = await client.callTool({
        name: 'memory-list',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
        },
      })
      const listResult = JSON.parse(getFirstTextContent(listed.content)) as { total: number }
      expect(listResult.total).toBe(1)

      const fetched = await client.callTool({
        name: 'memory-get',
        arguments: { id: memoryId },
      })
      const memory = JSON.parse(getFirstTextContent(fetched.content)) as {
        id: string
        status: string
        supersededBy: string
        supersededByMemory: { id: string; status: string }
      }
      expect(memory.id).toBe(memoryId)
      expect(memory.status).toBe('suppressed')
      expect(memory.supersededBy).toBe(replacementMemoryId)
      expect(memory.supersededByMemory.id).toBe(replacementMemoryId)
      expect(memory.supersededByMemory.status).toBe('active')

      const historyBeforeDelete = await client.callTool({
        name: 'memory-get-history',
        arguments: { id: memoryId },
      })
      const historyBeforeDeleteResult = JSON.parse(getFirstTextContent(historyBeforeDelete.content)) as {
        items: Array<{ eventType: string }>
      }
      expect(historyBeforeDeleteResult.items.map(item => item.eventType)).toEqual(['created', 'contradicted'])

      app.memoryService.deleteMemory({
        id: replacementMemoryId,
        source: { channel: 'cli' },
      })

      const historyAfterDelete = await client.callTool({
        name: 'memory-get-history',
        arguments: { id: replacementMemoryId },
      })
      const historyAfterDeleteResult = JSON.parse(getFirstTextContent(historyAfterDelete.content)) as {
        items: Array<{ eventType: string }>
      }
      expect(historyAfterDeleteResult.items.map(item => item.eventType)).toEqual(['created', 'deleted'])

      const searched = await client.callTool({
        name: 'memory-search',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          subject: 'prefer pnpm',
          limit: 10,
        },
      })
      const searchResult = JSON.parse(getFirstTextContent(searched.content)) as { total: number }
      expect(searchResult.total).toBe(0)
      const replacementSearch = await client.callTool({
        name: 'memory-search',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          subject: 'prefer npm',
          limit: 10,
        },
      })
      const replacementSearchResult = JSON.parse(getFirstTextContent(replacementSearch.content)) as { total: number }
      expect(replacementSearchResult.total).toBe(0)
      expect(tools.tools.some(tool => tool.name === 'memory-query')).toBe(false)
    } finally {
      await client.close()
      await mcp.server.close()
      app.close()
    }
  })
})
