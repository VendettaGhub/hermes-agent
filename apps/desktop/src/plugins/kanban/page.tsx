import {
  Button,
  cn,
  Codicon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  fmtDateTime,
  host,
  Input,
  Loader,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  useMutation,
  usePluginI18n,
  useQuery,
  useQueryClient,
  useValue
} from '@hermes/plugin-sdk'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  KanbanBoardMeta,
  KanbanBoardResponse,
  KanbanBoardsResponse,
  KanbanColumn,
  KanbanRest,
  KanbanTask,
  KanbanTaskDetailResponse
} from './types'

const PLUGIN_ID = 'kanban'
const POLL_MS = 15_000
const STATUS_ORDER = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done'] as const

const STATUS_TONE: Record<string, string> = {
  triage: 'bg-violet-500',
  todo: 'bg-slate-400',
  scheduled: 'bg-amber-500',
  ready: 'bg-sky-500',
  running: 'bg-emerald-500',
  blocked: 'bg-red-500',
  review: 'bg-fuchsia-500',
  done: 'bg-zinc-500'
}

function boardLabel(board: KanbanBoardMeta): string {
  return board.label || board.name || board.slug
}

function querySuffix(board: string): string {
  return `board=${encodeURIComponent(board)}`
}

function taskCount(columns: KanbanColumn[]): number {
  return columns.reduce((total, column) => total + column.tasks.length, 0)
}

function formatTime(timestamp?: null | number): string {
  if (!timestamp) {
    return '—'
  }

  return fmtDateTime.format(new Date(timestamp * 1000))
}

function matchesTask(task: KanbanTask, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase()

  if (!query) {
    return true
  }

  return [task.id, task.title, task.body, task.assignee, task.tenant, task.latest_summary]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(query))
}

function normalizeColumns(response?: KanbanBoardResponse): KanbanColumn[] {
  const serverColumns = response?.columns ?? []
  const byName = new Map(serverColumns.map(column => [column.name, column]))
  const known = STATUS_ORDER.map(name => byName.get(name) ?? { name, tasks: [] })
  const unknown = serverColumns.filter(column => !STATUS_ORDER.includes(column.name as (typeof STATUS_ORDER)[number]))

  return [...known, ...unknown]
}

function statusLabel(t: ReturnType<typeof usePluginI18n>, status: string): string {
  const key = `status.${status}`
  const translated = t(key)

  if (translated !== key) {
    return translated
  }

  return status
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface MutationScope {
  board: string
  profile: string
}

interface KanbanPageProps {
  rest: KanbanRest
}

export function KanbanPage({ rest }: KanbanPageProps) {
  const t = usePluginI18n(PLUGIN_ID)
  const profile = useValue(host.state.profile)
  const queryClient = useQueryClient()
  const [boardSelection, setBoardSelection] = useState({ board: '', profile: '' })
  const [includeSystem, setIncludeSystem] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<null | string>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const columnRefs = useRef<Record<string, HTMLElement | null>>({})
  const selectedBoard = boardSelection.profile === profile ? boardSelection.board : ''
  const setSelectedBoard = useCallback((board: string) => setBoardSelection({ board, profile }), [profile])

  const boardsQuery = useQuery({
    queryKey: ['desktop-kanban', profile, 'boards', includeSystem],
    queryFn: () => rest<KanbanBoardsResponse>(`/boards?include_system=${includeSystem ? 'true' : 'false'}`),
    refetchInterval: POLL_MS
  })

  useEffect(() => {
    setSelectedBoard('')
    setSelectedTaskId(null)
    setCreateOpen(false)
  }, [profile, setSelectedBoard])

  useEffect(() => {
    const response = boardsQuery.data

    if (!response) {
      return
    }

    if (response.boards.length === 0) {
      if (selectedBoard) {
        setSelectedBoard('')
        setSelectedTaskId(null)
      }

      return
    }

    if (!selectedBoard || !response.boards.some(board => board.slug === selectedBoard)) {
      const currentBoard = response.boards.find(board => board.slug === response.current)

      setSelectedBoard(currentBoard?.slug ?? response.boards[0].slug)
    }
  }, [boardsQuery.data, selectedBoard, setSelectedBoard])

  const boardQuery = useQuery({
    enabled: Boolean(selectedBoard),
    queryKey: ['desktop-kanban', profile, 'board', selectedBoard],
    queryFn: () => rest<KanbanBoardResponse>(`/board?${querySuffix(selectedBoard)}`),
    refetchInterval: POLL_MS
  })

  const detailQuery = useQuery({
    enabled: Boolean(selectedBoard && selectedTaskId),
    queryKey: ['desktop-kanban', profile, 'task', selectedBoard, selectedTaskId],
    queryFn: () =>
      rest<KanbanTaskDetailResponse>(`/tasks/${encodeURIComponent(selectedTaskId || '')}?${querySuffix(selectedBoard)}`)
  })

  const invalidateBoard = async (scope: MutationScope) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['desktop-kanban', scope.profile, 'board', scope.board] }),
      queryClient.invalidateQueries({ queryKey: ['desktop-kanban', scope.profile, 'boards'] })
    ])
  }

  const createTask = useMutation({
    mutationFn: (input: MutationScope & { body: string; title: string }) =>
      rest(`/tasks?${querySuffix(input.board)}`, {
        method: 'POST',
        body: { body: input.body || null, title: input.title, triage: true }
      }),
    onSuccess: async (_data, input) => {
      setCreateOpen(false)
      await invalidateBoard(input)
    },
    onError: error => host.notifyError(error, t('errors.create'))
  })

  const updateStatus = useMutation({
    mutationFn: (input: MutationScope & { status: string; taskId: string }) =>
      rest(`/tasks/${encodeURIComponent(input.taskId)}?${querySuffix(input.board)}`, {
        method: 'PATCH',
        body: { status: input.status }
      }),
    onSuccess: async (_data, input) => {
      await invalidateBoard(input)
      await queryClient.invalidateQueries({
        queryKey: ['desktop-kanban', input.profile, 'task', input.board, input.taskId]
      })
    },
    onError: error => host.notifyError(error, t('errors.update'))
  })

  const addComment = useMutation({
    mutationFn: (input: MutationScope & { body: string; taskId: string }) =>
      rest(`/tasks/${encodeURIComponent(input.taskId)}/comments?${querySuffix(input.board)}`, {
        method: 'POST',
        body: { author: 'desktop', body: input.body }
      }),
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({
        queryKey: ['desktop-kanban', input.profile, 'task', input.board, input.taskId]
      })
      await invalidateBoard(input)
    },
    onError: error => host.notifyError(error, t('errors.comment'))
  })

  const columns = useMemo(() => normalizeColumns(boardQuery.data), [boardQuery.data])

  const filteredColumns = useMemo(
    () => columns.map(column => ({ ...column, tasks: column.tasks.filter(task => matchesTask(task, query)) })),
    [columns, query]
  )

  const total = boardQuery.data ? taskCount(columns) : 0
  const selectedTask = detailQuery.data?.task ?? null
  const refreshing = boardsQuery.isFetching || boardQuery.isFetching

  const refresh = () => {
    void boardsQuery.refetch()
    void boardQuery.refetch()
  }

  if (boardsQuery.isPending) {
    return <LoadingState label={t('loading')} />
  }

  if (boardsQuery.isError) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <Codicon className="mx-auto text-destructive" name="error" size="1.5rem" />
          <div className="text-sm font-semibold">{t('loadFailed')}</div>
          <div className="text-xs text-(--ui-text-tertiary)">{String(boardsQuery.error)}</div>
          <Button onClick={() => void boardsQuery.refetch()} size="sm" variant="outline">
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2">
            <Codicon className="text-(--ui-text-secondary)" name="project" size="1rem" />
            <h1 className="text-sm font-semibold">{t('title')}</h1>
          </div>

          <label className="sr-only" htmlFor="desktop-kanban-board">
            {t('board')}
          </label>
          <select
            className="h-7 min-w-48 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-control-background) px-2 text-xs"
            id="desktop-kanban-board"
            onChange={event => {
              setSelectedBoard(event.target.value)
              setSelectedTaskId(null)
            }}
            value={selectedBoard}
          >
            {boardsQuery.data.boards.length === 0 ? <option value="">{t('noBoards')}</option> : null}
            {boardsQuery.data.boards.map(board => (
              <option key={board.slug} value={board.slug}>
                {boardLabel(board)} · {board.total}
              </option>
            ))}
          </select>

          <span className="text-[0.6875rem] text-(--ui-text-tertiary)">{t('taskCount', total)}</span>

          {boardsQuery.data.hidden_system_count > 0 || includeSystem ? (
            <Button onClick={() => setIncludeSystem(current => !current)} size="sm" variant="outline">
              {includeSystem ? t('hideDelegations') : t('showDelegations', boardsQuery.data.hidden_system_count)}
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            <Button disabled={!selectedBoard || createTask.isPending} onClick={() => setCreateOpen(true)} size="sm">
              <Codicon name="add" size="0.875rem" />
              {t('newTask')}
            </Button>
            <Button aria-label={t('refresh')} disabled={refreshing} onClick={refresh} size="sm" variant="outline">
              <Codicon className={cn(refreshing && 'animate-spin')} name="refresh" size="0.875rem" />
              <span className="hidden sm:inline">{t('refresh')}</span>
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Codicon
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-(--ui-text-tertiary)"
              name="search"
              size="0.875rem"
            />
            <Input
              aria-label={t('search')}
              className="h-7 pl-7 text-xs"
              onChange={event => setQuery(event.target.value)}
              placeholder={t('search')}
              value={query}
            />
          </div>
          <nav aria-label={t('columns')} className="flex max-w-full gap-1 overflow-x-auto py-0.5">
            {filteredColumns.map(column => (
              <button
                className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                key={column.name}
                onClick={() =>
                  columnRefs.current[column.name]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
                }
                type="button"
              >
                <span className={cn('size-1.5 rounded-full', STATUS_TONE[column.name] ?? 'bg-zinc-500')} />
                {statusLabel(t, column.name)}
                <span className="text-(--ui-text-quaternary)">{column.tasks.length}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {boardsQuery.data.boards.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="space-y-2">
            <Codicon className="mx-auto text-(--ui-text-tertiary)" name="project" size="1.5rem" />
            <div className="text-sm font-medium">{t('noBoards')}</div>
          </div>
        </div>
      ) : boardQuery.isPending ? (
        <LoadingState label={t('loadingBoard')} />
      ) : boardQuery.isError ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('loadFailed')}</div>
            <Button onClick={() => void boardQuery.refetch()} size="sm" variant="outline">
              {t('retry')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 [scrollbar-gutter:stable]">
          <div className="grid h-full min-w-max auto-cols-[minmax(16rem,19rem)] grid-flow-col gap-2.5">
            {filteredColumns.map(column => (
              <KanbanColumnView
                column={column}
                key={column.name}
                onOpenTask={setSelectedTaskId}
                ref={element => {
                  columnRefs.current[column.name] = element
                }}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      <TaskSheet
        addComment={async body => {
          if (selectedTaskId) {
            await addComment.mutateAsync({ board: selectedBoard, body, profile, taskId: selectedTaskId })
          }
        }}
        detail={detailQuery.data}
        error={detailQuery.isError}
        loading={detailQuery.isPending && Boolean(selectedTaskId)}
        onOpenChange={open => !open && setSelectedTaskId(null)}
        onOpenTask={setSelectedTaskId}
        onRetry={() => void detailQuery.refetch()}
        open={Boolean(selectedTaskId)}
        pending={updateStatus.isPending || addComment.isPending}
        setStatus={status =>
          selectedTaskId && updateStatus.mutate({ board: selectedBoard, profile, status, taskId: selectedTaskId })
        }
        t={t}
        task={selectedTask}
      />

      <CreateTaskDialog
        loading={createTask.isPending}
        onCreate={(title, body) => createTask.mutate({ board: selectedBoard, body, profile, title })}
        onOpenChange={setCreateOpen}
        open={createOpen}
        t={t}
      />
    </section>
  )
}

interface ColumnViewProps {
  column: KanbanColumn
  onOpenTask: (taskId: string) => void
  ref?: (element: HTMLElement | null) => void
  t: ReturnType<typeof usePluginI18n>
}

function KanbanColumnView({ column, onOpenTask, ref, t }: ColumnViewProps) {
  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background)"
      ref={ref}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-2.5">
        <span className={cn('size-2 rounded-full', STATUS_TONE[column.name] ?? 'bg-zinc-500')} />
        <h2 className="text-xs font-semibold">{statusLabel(t, column.name)}</h2>
        <span className="ml-auto text-[0.6875rem] text-(--ui-text-tertiary)">{column.tasks.length}</span>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
        {column.tasks.length === 0 ? (
          <div className="grid min-h-24 place-items-center rounded-md border border-dashed border-(--ui-stroke-tertiary) px-3 text-center text-[0.6875rem] text-(--ui-text-quaternary)">
            {t('emptyColumn')}
          </div>
        ) : (
          column.tasks.map(task => <KanbanCard key={task.id} onOpen={() => onOpenTask(task.id)} t={t} task={task} />)
        )}
      </div>
    </section>
  )
}

function KanbanCard({ task, onOpen, t }: { onOpen: () => void; t: ReturnType<typeof usePluginI18n>; task: KanbanTask }) {
  return (
    <button
      className="group w-full rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-2 text-left transition-colors hover:border-(--ui-stroke-secondary) hover:bg-(--ui-control-hover-background)"
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-center gap-1.5 text-[0.625rem] text-(--ui-text-tertiary)">
        <span className="font-mono">{task.id}</span>
        <span className="ml-auto rounded bg-(--ui-bg-quinary) px-1 py-0.5 font-medium">P{task.priority}</span>
      </div>
      <div className="mt-1 line-clamp-3 text-xs font-medium leading-4 text-foreground">{task.title}</div>
      <div className="mt-2 flex items-center gap-2 text-[0.625rem] text-(--ui-text-tertiary)">
        {task.assignee ? <span>@{task.assignee}</span> : <span>{t('unassigned')}</span>}
        {task.comment_count ? (
          <span className="ml-auto flex items-center gap-1">
            <Codicon name="comment" size="0.75rem" /> {task.comment_count}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function TaskSheet({
  addComment,
  detail,
  error,
  loading,
  onOpenChange,
  onOpenTask,
  onRetry,
  open,
  pending,
  setStatus,
  t,
  task
}: {
  addComment: (body: string) => Promise<void>
  detail?: KanbanTaskDetailResponse
  error: boolean
  loading: boolean
  onOpenChange: (open: boolean) => void
  onOpenTask: (taskId: string) => void
  onRetry: () => void
  open: boolean
  pending: boolean
  setStatus: (status: string) => void
  t: ReturnType<typeof usePluginI18n>
  task: KanbanTask | null
}) {
  const [comment, setComment] = useState('')

  useEffect(() => setComment(''), [task?.id])

  const submitComment = async (event: FormEvent) => {
    event.preventDefault()
    const body = comment.trim()

    if (!body) {
      return
    }

    try {
      await addComment(body)
      setComment('')
    } catch {
      // The mutation owns the error toast. Keep the draft so the user can retry.
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-[min(44rem,88vw)] sm:max-w-2xl" side="right">
        <SheetHeader className="border-b border-(--ui-stroke-tertiary) pr-10">
          <SheetTitle>{task?.title ?? t('task')}</SheetTitle>
          <SheetDescription>{task?.id ?? ''}</SheetDescription>
        </SheetHeader>
        {error ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div className="space-y-3">
              <Codicon className="mx-auto text-destructive" name="error" size="1.5rem" />
              <div className="text-xs text-(--ui-text-tertiary)">{t('taskLoadFailed')}</div>
              <Button onClick={onRetry} size="sm" variant="outline">
                {t('retry')}
              </Button>
            </div>
          </div>
        ) : loading || !task ? (
          <LoadingState label={t('loadingTask')} />
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-3 text-xs sm:grid-cols-3">
              <TaskMeta label={t('statusLabel')} value={statusLabel(t, task.status)} />
              <TaskMeta label={t('assignee')} value={task.assignee || t('unassigned')} />
              <TaskMeta label={t('priority')} value={String(task.priority)} />
              <TaskMeta label={t('created')} value={formatTime(task.created_at)} />
              <TaskMeta label={t('workspace')} value={task.workspace_path || task.workspace_kind || '—'} wide />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {task.status !== 'ready' && task.status !== 'running' && task.status !== 'done' ? (
                <Button disabled={pending} onClick={() => setStatus('ready')} size="sm" variant="outline">
                  {t('moveReady')}
                </Button>
              ) : null}
              {task.status !== 'blocked' && task.status !== 'done' ? (
                <Button disabled={pending} onClick={() => setStatus('blocked')} size="sm" variant="outline">
                  {t('block')}
                </Button>
              ) : null}
              {task.status !== 'done' ? (
                <Button disabled={pending} onClick={() => setStatus('done')} size="sm">
                  {t('complete')}
                </Button>
              ) : null}
              <Button disabled={pending} onClick={() => setStatus('archived')} size="sm" variant="outline">
                {t('archive')}
              </Button>
            </div>

            <TaskSection label={t('description')} value={task.body} />
            <TaskSection label={t('latestSummary')} value={task.latest_summary || task.result} />

            {detail && (detail.links.parents.length > 0 || detail.links.children.length > 0) ? (
              <section>
                <h3 className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
                  {t('dependencies')}
                </h3>
                <div className="space-y-1 font-mono text-[0.6875rem] text-(--ui-text-secondary)">
                  {detail.links.parents.map(id => (
                    <button
                      className="block rounded px-1 py-0.5 text-left hover:bg-(--ui-control-hover-background) hover:text-foreground"
                      key={`parent-${id}`}
                      onClick={() => onOpenTask(id)}
                      type="button"
                    >
                      ↑ {id}
                    </button>
                  ))}
                  {detail.links.children.map(id => (
                    <button
                      className="block rounded px-1 py-0.5 text-left hover:bg-(--ui-control-hover-background) hover:text-foreground"
                      key={`child-${id}`}
                      onClick={() => onOpenTask(id)}
                      type="button"
                    >
                      ↓ {id}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
                {t('comments')}
              </h3>
              <div className="space-y-2">
                {detail?.comments.length ? (
                  detail.comments.map(item => (
                    <article className="rounded-md bg-(--ui-bg-quinary) p-2 text-xs" key={item.id}>
                      <div className="mb-1 flex gap-2 text-[0.625rem] text-(--ui-text-tertiary)">
                        <span>{item.author || 'unknown'}</span>
                        <span>{formatTime(item.created_at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap wrap-anywhere">{item.body}</div>
                    </article>
                  ))
                ) : (
                  <div className="text-xs text-(--ui-text-quaternary)">{t('noComments')}</div>
                )}
              </div>
              <form className="mt-2 flex gap-2" onSubmit={event => void submitComment(event)}>
                <Input
                  aria-label={t('commentPlaceholder')}
                  className="h-8 text-xs"
                  disabled={pending}
                  onChange={event => setComment(event.target.value)}
                  placeholder={t('commentPlaceholder')}
                  value={comment}
                />
                <Button disabled={pending || !comment.trim()} size="sm" type="submit">
                  {t('comment')}
                </Button>
              </form>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-32 place-items-center p-6">
      <div className="flex flex-col items-center gap-2 text-xs text-(--ui-text-tertiary)">
        <Loader type="lemniscate-bloom" />
        <span>{label}</span>
      </div>
    </div>
  )
}

function TaskMeta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2 sm:col-span-3')}>
      <div className="text-[0.625rem] uppercase tracking-wide text-(--ui-text-tertiary)">{label}</div>
      <div className="mt-0.5 truncate text-(--ui-text-secondary)" title={value}>
        {value}
      </div>
    </div>
  )
}

function TaskSection({ label, value }: { label: string; value?: null | string }) {
  if (!value) {
    return null
  }

  return (
    <section>
      <h3 className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">{label}</h3>
      <div className="whitespace-pre-wrap wrap-anywhere text-xs leading-5 text-(--ui-text-secondary)">{value}</div>
    </section>
  )
}

function CreateTaskDialog({
  loading,
  onCreate,
  onOpenChange,
  open,
  t
}: {
  loading: boolean
  onCreate: (title: string, body: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  t: ReturnType<typeof usePluginI18n>
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!open) {
      setTitle('')
      setBody('')
    }
  }, [open])

  const submit = (event: FormEvent) => {
    event.preventDefault()

    if (title.trim()) {
      onCreate(title.trim(), body.trim())
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('newTask')}</DialogTitle>
            <DialogDescription>{t('newTaskDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input
              aria-label={t('taskTitle')}
              autoFocus
              onChange={event => setTitle(event.target.value)}
              placeholder={t('taskTitle')}
              value={title}
            />
            <Textarea
              aria-label={t('taskDescription')}
              className="min-h-32"
              onChange={event => setBody(event.target.value)}
              placeholder={t('taskDescription')}
              value={body}
            />
          </div>
          <DialogFooter>
            <Button disabled={loading || !title.trim()} type="submit">
              {loading ? t('creating') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
