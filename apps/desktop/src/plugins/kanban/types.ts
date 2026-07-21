export interface KanbanBoardMeta {
  counts: Record<string, number>
  is_current?: boolean
  label?: string
  name?: string
  slug: string
  system?: boolean
  total: number
}

export interface KanbanBoardsResponse {
  boards: KanbanBoardMeta[]
  current: string
  hidden_system_count: number
}

export interface KanbanTask {
  assignee?: null | string
  body?: null | string
  comment_count?: number
  completed_at?: null | number
  created_at: number
  id: string
  latest_summary?: null | string
  link_counts?: { children: number; parents: number }
  priority: number
  result?: null | string
  started_at?: null | number
  status: string
  tenant?: null | string
  title: string
  workspace_kind?: string
  workspace_path?: null | string
}

export interface KanbanColumn {
  name: string
  tasks: KanbanTask[]
}

export interface KanbanBoardResponse {
  assignees: string[]
  columns: KanbanColumn[]
  latest_event_id: number
  now: number
  tenants: string[]
}

export interface KanbanComment {
  author?: null | string
  body: string
  created_at: number
  id: number
  task_id: string
}

export interface KanbanTaskDetailResponse {
  child_results: Array<{ id: string; latest_summary?: null | string; result?: null | string; status: string; title: string }>
  comments: KanbanComment[]
  links: { children: string[]; parents: string[] }
  task: KanbanTask
}

export type KanbanRest = <T>(path: string, options?: { body?: unknown; method?: string; timeoutMs?: number }) => Promise<T>
