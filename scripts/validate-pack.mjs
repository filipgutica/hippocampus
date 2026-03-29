import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-pack-validate-'))
const tarballDir = path.join(tempRoot, 'tarball')
const extractDir = path.join(tempRoot, 'extract')

fs.mkdirSync(tarballDir, { recursive: true })
fs.mkdirSync(extractDir, { recursive: true })

try {
  execFileSync('pnpm', ['pack', '--pack-destination', tarballDir], {
    stdio: 'pipe',
  })

  const tarballs = fs.readdirSync(tarballDir).filter(name => name.endsWith('.tgz'))
  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one tarball in ${tarballDir}, found ${tarballs.length}.`)
  }

  const tarballPath = path.join(tarballDir, tarballs[0])
  const tarEntries = execFileSync('tar', ['-tzf', tarballPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (!tarEntries.split('\n').includes('package/skills/memory-runtime-policy-skill.md')) {
    throw new Error('Packed artifact is missing package/skills/memory-runtime-policy-skill.md.')
  }

  if (!tarEntries.split('\n').includes('package/skills/memory-scope-skill.md')) {
    throw new Error('Packed artifact is missing package/skills/memory-scope-skill.md.')
  }

  execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir], {
    stdio: 'pipe',
  })

  const packagedModulePath = path.join(
    extractDir,
    'package',
    'dist',
    'guidance',
    'guidance-catalog.js',
  )

  if (!fs.existsSync(packagedModulePath)) {
    throw new Error(`Packed artifact is missing ${packagedModulePath}.`)
  }

  const packagedModule = await import(pathToFileURL(packagedModulePath).href)
  const runtimePolicy = packagedModule.readGuidanceArtifact(packagedModule.runtimeMemoryPolicyResource)

  if (typeof runtimePolicy !== 'string' || !runtimePolicy.includes('# Hippocampus Runtime Memory Policy')) {
    throw new Error('Packed guidance resolver did not return the shipped runtime memory policy content.')
  }

  const guidance = packagedModule.readGuidanceArtifact(packagedModule.memoryScopeGuidanceResource)

  if (typeof guidance !== 'string' || !guidance.includes('# Hippocampus Memory Scope Guidance')) {
    throw new Error('Packed guidance resolver did not return the shipped memory-scope guidance content.')
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
