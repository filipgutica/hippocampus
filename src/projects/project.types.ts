export type ProjectIdentitySource = 'remote_url' | 'local_uuid'

export type EnsuredProject = {
  id: string
  scope: {
    type: 'project'
    id: string
  }
  identitySource: ProjectIdentitySource
  identityValue: string
  repoRoot: string
  created: boolean
}
