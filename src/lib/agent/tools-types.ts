// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>
}

export interface ToolResult {
  success: boolean
  data: unknown
  summary: string
  count?: number
}

export type ToolExecutor = (params: Record<string, unknown>) => Promise<ToolResult>