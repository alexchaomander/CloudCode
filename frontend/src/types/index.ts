export interface User {
  id: string
  username: string
  isAdmin: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface AgentProfile {
  id: string
  name: string
  slug: string
  command: string
  args: string[]
  env: Record<string, string>
  defaultWorkdir: string | null
  startupTemplate: string | null
  stopMethod: string
  supportsInteractiveInput: boolean
}

export interface RepoRoot {
  id: string
  label: string
  absolutePath: string
}

export interface Session {
  id: string
  publicId: string
  title: string
  agentProfileId: string
  repoRootId: string | null
  workdir: string
  tmuxSessionName: string
  status: 'running' | 'starting' | 'stopped' | 'killed' | 'error'
  createdAt: string
  lastOutputAt: string | null
  startedAt: string | null
  stoppedAt: string | null
  pinned: boolean
  archived: boolean
  agentProfile?: AgentProfile
  repoRoot?: RepoRoot
  gitInfo?: {
    branch: string
    isDirty: boolean
  }
}

export interface AuditLog {
  id: string
  actorUserId: string | null
  actorUsername: string | null
  eventType: string
  targetType: string | null
  targetId: string | null
  metadata: any | null
  createdAt: string
}

export interface SessionSnapshot {
  id: string
  sessionId: string
  snapshotType: string
  contentText: string
  createdAt: string
}

export interface DiscoveredProject {
  name: string
  absolutePath: string
  rootId: string
  rootLabel: string
  isRoot?: boolean
  gitInfo?: {
    branch: string
    isDirty: boolean
  }
}
