export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  rateLimits: RateLimit[]
  contextPercent?: number
  isStale: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'quota-gauge': { snapshot: Snapshot | null; now: number }
  }
}
