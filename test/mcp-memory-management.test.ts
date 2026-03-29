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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('MCP memory management tools', () => {
  it('lists, gets, histories, and keeps delete off the default MCP surface', async () => {
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
      expect(listTool).toBeDefined()
      expect(getTool).toBeDefined()
      expect(historyTool).toBeDefined()
      expect(applyTool).toBeDefined()
      expect(listTool?.description).toContain('orientation or debugging')
      expect(getTool?.description).toContain('known memory by id after discovery')
      expect(historyTool?.description).toContain('not the normal retrieval path')
      expect(applyTool?.description).toContain('Save only durable scoped observations')
      expect(tools.tools.some(tool => tool.name === 'memory-delete')).toBe(false)

      const applied = await client.callTool({
        name: 'memory-apply-observation',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          kind: 'preference',
          subject: 'Prefer pnpm',
          statement: 'Use pnpm for this repo.',
        },
      })
      const appliedResult = JSON.parse(getFirstTextContent(applied.content)) as { memory: { id: string } }
      const memoryId = appliedResult.memory.id

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
      const memory = JSON.parse(getFirstTextContent(fetched.content)) as { id: string; status: string }
      expect(memory.id).toBe(memoryId)
      expect(memory.status).toBe('active')

      const historyBeforeDelete = await client.callTool({
        name: 'memory-get-history',
        arguments: { id: memoryId },
      })
      const historyBeforeDeleteResult = JSON.parse(getFirstTextContent(historyBeforeDelete.content)) as { total: number }
      expect(historyBeforeDeleteResult.total).toBe(1)

      app.memoryService.deleteMemory({
        id: memoryId,
        source: { channel: 'cli' },
      })

      const historyAfterDelete = await client.callTool({
        name: 'memory-get-history',
        arguments: { id: memoryId },
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
      expect(tools.tools.some(tool => tool.name === 'memory-query')).toBe(false)
    } finally {
      await client.close()
      await mcp.server.close()
      app.close()
    }
  })
})
