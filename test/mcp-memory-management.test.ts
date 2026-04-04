import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app/build-app.js'
import { createMcpServer } from '../src/mcp/server.js'
import { registerMemoryDeleteTool } from '../src/mcp/tools/memory-delete.tool.js'

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

const getSourceProperties = (tool: { inputSchema?: unknown } | undefined): Record<string, unknown> | null => {
  if (!tool || !tool.inputSchema || typeof tool.inputSchema !== 'object' || !('properties' in tool.inputSchema)) {
    return null
  }

  const properties = tool.inputSchema.properties
  if (!properties || typeof properties !== 'object' || !('source' in properties)) {
    return null
  }

  const source = properties.source
  if (!source || typeof source !== 'object' || !('properties' in source)) {
    return null
  }

  return source.properties as Record<string, unknown>
}

const expectToolCallToFail = async (call: Promise<unknown>): Promise<void> => {
  try {
    const result = (await call) as { isError?: boolean; content?: unknown }
    expect(result.isError).toBe(true)
    expect(getFirstTextContent(result.content)).not.toBe('')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }
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
      expect(searchTool?.description).toContain('always provide `subject`')
      expect(listTool?.description).toContain('broad recall by memory class')
      expect(listTool?.description).toContain('scope-plus-type browsing')
      expect(getTool?.description).toContain('including non-active memories')
      expect(historyTool?.description).toContain('later archival history')
      expect(applyTool?.description).toContain('call `memory-get-policy` first')
      expect(applyTool?.description).toContain('will not appear in normal search/list results')
      expect(contradictTool?.description).toContain('First find the id with `memory-search` or `memory-list`')
      expect(getScopeIdDescription(searchTool)).toContain('canonical absolute path to the repo root')
      expect(getScopeIdDescription(listTool)).toContain('canonical absolute path to the repo root')
      expect(getScopeIdDescription(applyTool)).toContain('canonical absolute path to the repo root')
      expect(getReplacementScopeIdDescription(contradictTool)).toContain('canonical absolute path to the repo root')
      expect(getSourceProperties(applyTool)).toMatchObject({
        channel: expect.anything(),
        agent: expect.anything(),
        sessionId: expect.anything(),
      })
      expect(getSourceProperties(contradictTool)).toMatchObject({
        channel: expect.anything(),
        agent: expect.anything(),
        sessionId: expect.anything(),
      })
      expect(tools.tools.some(tool => tool.name === 'memory-delete')).toBe(false)

      const applied = await client.callTool({
        name: 'memory-apply-observation',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          type: 'preference',
          subject: 'Prefer pnpm',
          statement: 'Use pnpm for this repo.',
          origin: 'explicit_user_statement',
          source: { channel: 'mcp', agent: 'codex', sessionId: 'session-1' },
        },
      })
      const appliedResult = JSON.parse(getFirstTextContent(applied.content)) as { memory: { id: string } }
      const memoryId = appliedResult.memory.id

      const contradicted = await client.callTool({
        name: 'memory-contradict',
        arguments: {
          id: memoryId,
          source: { channel: 'mcp', agent: 'codex', sessionId: 'session-1' },
          replacement: {
            scope: { type: 'repo', id: '/tmp/example-repo' },
            type: 'preference',
            subject: 'Prefer npm',
            statement: 'Use npm for this repo.',
            origin: 'explicit_user_statement',
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
        latestEventSummary: { eventType: string; createdAt: string; source: { channel: string } | null } | null
      }
      expect(memory.id).toBe(memoryId)
      expect(memory.status).toBe('suppressed')
      expect(memory.supersededBy).toBe(replacementMemoryId)
      expect(memory.supersededByMemory.id).toBe(replacementMemoryId)
      expect(memory.supersededByMemory.status).toBe('active')
      expect(memory.latestEventSummary?.eventType).toBe('contradicted')

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
          matchMode: 'exact',
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
          matchMode: 'exact',
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

  it('rejects invalid provenance on the MCP mutation tools', async () => {
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
    const client = new Client({ name: 'hippo-mcp-negative-test', version: '1.0.0' })

    try {
      await mcp.server.connect(serverTransport)
      await client.connect(clientTransport)

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-apply-observation',
          arguments: {
            scope: { type: 'repo', id: '/tmp/example-repo' },
            type: 'preference',
            subject: 'Prefer pnpm',
            statement: 'Use pnpm for this repo.',
            origin: 'explicit_user_statement',
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-apply-observation',
          arguments: {
            scope: { type: 'repo', id: '/tmp/example-repo' },
            type: 'preference',
            subject: 'Prefer pnpm',
            statement: 'Use pnpm for this repo.',
            origin: 'explicit_user_statement',
            source: { channel: 'mcp', sessionId: 'session-1' },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-apply-observation',
          arguments: {
            scope: { type: 'repo', id: '/tmp/example-repo' },
            type: 'preference',
            subject: 'Prefer pnpm',
            statement: 'Use pnpm for this repo.',
            origin: 'explicit_user_statement',
            source: { channel: 'mcp', agent: 'codex' },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-apply-observation',
          arguments: {
            scope: { type: 'repo', id: '/tmp/example-repo' },
            type: 'preference',
            subject: 'Prefer pnpm',
            statement: 'Use pnpm for this repo.',
            origin: 'explicit_user_statement',
            source: { channel: 'mcp', runId: 'legacy-session' },
          },
        }),
      )

      const created = await client.callTool({
        name: 'memory-apply-observation',
        arguments: {
          scope: { type: 'repo', id: '/tmp/example-repo' },
          type: 'preference',
          subject: 'Prefer pnpm',
          statement: 'Use pnpm for this repo.',
          origin: 'explicit_user_statement',
          source: { channel: 'mcp', agent: 'codex', sessionId: 'session-1' },
        },
      })
      const createdResult = JSON.parse(getFirstTextContent(created.content)) as { memory: { id: string } }

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-contradict',
          arguments: {
            id: createdResult.memory.id,
            replacement: {
              scope: { type: 'repo', id: '/tmp/example-repo' },
              type: 'preference',
              subject: 'Prefer npm',
              statement: 'Use npm for this repo.',
              origin: 'explicit_user_statement',
            },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-contradict',
          arguments: {
            id: createdResult.memory.id,
            source: { channel: 'mcp', sessionId: 'session-1' },
            replacement: {
              scope: { type: 'repo', id: '/tmp/example-repo' },
              type: 'preference',
              subject: 'Prefer npm',
              statement: 'Use npm for this repo.',
              origin: 'explicit_user_statement',
            },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-contradict',
          arguments: {
            id: createdResult.memory.id,
            source: { channel: 'mcp', agent: 'codex' },
            replacement: {
              scope: { type: 'repo', id: '/tmp/example-repo' },
              type: 'preference',
              subject: 'Prefer npm',
              statement: 'Use npm for this repo.',
              origin: 'explicit_user_statement',
            },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-contradict',
          arguments: {
            id: createdResult.memory.id,
            source: { channel: 'mcp', runId: 'legacy-session' },
            replacement: {
              scope: { type: 'repo', id: '/tmp/example-repo' },
              type: 'preference',
              subject: 'Prefer npm',
              statement: 'Use npm for this repo.',
              origin: 'explicit_user_statement',
            },
          },
        }),
      )
    } finally {
      await client.close()
      await mcp.server.close()
      app.close()
    }
  })

  it('rejects invalid provenance on the delete tool when it is registered directly', async () => {
    const home = createTempDir()
    const app = await buildApp({
      mode: 'runtime',
      allowLazyInit: true,
      appHomeOverride: home,
    })

    if (app.mode !== 'runtime') {
      throw new Error('Expected runtime app container.')
    }

    const server = new McpServer({
      name: 'Hippocampus',
      version: '0.1.0',
    })
    registerMemoryDeleteTool(server, app.memoryService)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'hippo-delete-negative-test', version: '1.0.0' })

    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)

      const created = await app.memoryService.applyObservation({
        scope: { type: 'repo', id: '/tmp/example-repo' },
        type: 'preference',
        subject: 'Prefer pnpm',
        statement: 'Use pnpm for this repo.',
        origin: 'explicit_user_statement',
        source: { channel: 'cli' },
      })

      if (created.decision !== 'create' || !('memory' in created)) {
        throw new Error('Expected memory creation.')
      }

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-delete',
          arguments: {
            id: created.memory.id,
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-delete',
          arguments: {
            id: created.memory.id,
            source: { channel: 'mcp', sessionId: 'session-1' },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-delete',
          arguments: {
            id: created.memory.id,
            source: { channel: 'mcp', agent: 'codex' },
          },
        }),
      )

      await expectToolCallToFail(
        client.callTool({
          name: 'memory-delete',
          arguments: {
            id: created.memory.id,
            source: { channel: 'mcp', runId: 'legacy-session' },
          },
        }),
      )
    } finally {
      await client.close()
      await server.close()
      app.close()
    }
  })
})
