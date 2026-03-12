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
  argsJson: string
  envJson: string
  defaultWorkdir: string | null
  startupTemplate: string | null
  stopMethod: string
  supportsInteractiveInput: boolean
  createdAt: string
  updatedAt: string
}

export interface RepoRoot {
  id: string
  label: string
  absolutePath: string
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  publicId: string
  title: string
  agentProfileId: string
  repoRootId: string | null
  workdir: string
  tmuxSessionName: string
  status: 'starting' | 'running' | 'stopped' | 'killed' | 'error'
  createdAt: string
  updatedAt: string
  startedAt: string | null
  stoppedAt: string | null
  lastOutputAt: string | null
  pinned: boolean
  archived: boolean
  agentProfile?: AgentProfile
  repoRoot?: RepoRoot
}

export interface AuditLog {
  id: string
  actorUserId: string | null
  eventType: string
  targetType: string | null
  targetId: string | null
  metadataJson: string | null
  createdAt: string
}

export interface SessionSnapshot {
  id: string
  sessionId: string
  snapshotType: string
  contentText: string
  createdAt: string
}
