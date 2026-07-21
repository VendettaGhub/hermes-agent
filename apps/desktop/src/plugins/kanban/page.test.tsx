import { host } from '@hermes/plugin-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KanbanPage } from './page'
import type { KanbanRest } from './types'

vi.mock('@hermes/plugin-sdk', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>

  const labels: Record<string, string> = {
    title: 'Kanban',
    board: 'Board',
    task: 'Task',
    loading: 'Loading Kanban boards…',
    loadingBoard: 'Loading board…',
    loadingTask: 'Loading task…',
    taskLoadFailed: 'Task details could not be loaded.',
    loadFailed: 'Kanban could not be loaded',
    noBoards: 'No user boards are available.',
    retry: 'Retry',
    refresh: 'Refresh',
    search: 'Search tasks…',
    columns: 'Board columns',
    emptyColumn: 'No tasks',
    hideDelegations: 'Hide delegations',
    newTask: 'New task',
    newTaskDescription: 'Create a triage card on the selected board.',
    taskTitle: 'Task title',
    taskDescription: 'Description and acceptance criteria',
    create: 'Create',
    creating: 'Creating…',
    unassigned: 'Unassigned',
    statusLabel: 'Status',
    assignee: 'Assignee',
    priority: 'Priority',
    created: 'Created',
    workspace: 'Workspace',
    description: 'Description',
    latestSummary: 'Latest handoff',
    dependencies: 'Dependencies',
    comments: 'Comments',
    noComments: 'No comments yet.',
    commentPlaceholder: 'Add context for the worker…',
    comment: 'Comment',
    moveReady: 'Move to Ready',
    block: 'Block',
    complete: 'Complete',
    archive: 'Archive',
    'status.triage': 'Triage',
    'status.todo': 'Todo',
    'status.scheduled': 'Scheduled',
    'status.ready': 'Ready',
    'status.running': 'In Progress',
    'status.blocked': 'Blocked',
    'status.review': 'Review',
    'status.done': 'Done'
  }

  return {
    ...actual,
    host: { ...(actual.host as Record<string, unknown>), notifyError: vi.fn() },
    usePluginI18n: () => (key: string, ...args: unknown[]) => {
      if (key === 'taskCount') {
        return `${args[0]} tasks`
      }

      if (key === 'showDelegations') {
        return `Show delegations (${args[0]})`
      }

      return labels[key] ?? key
    }
  }
})

const boards = {
  boards: [{ slug: 'default', label: 'Default', total: 2, counts: { ready: 1, blocked: 1 } }],
  current: 'default',
  hidden_system_count: 1
}

const board = {
  assignees: ['kanban'],
  tenants: [],
  latest_event_id: 3,
  now: 2_000,
  columns: [
    {
      name: 'ready',
      tasks: [
        {
          id: 't_ready',
          title: 'Ship desktop board',
          status: 'ready',
          priority: 80,
          assignee: 'kanban',
          created_at: 1_000,
          comment_count: 1
        }
      ]
    },
    {
      name: 'blocked',
      tasks: [
        {
          id: 't_blocked',
          title: 'Needs human input',
          status: 'blocked',
          priority: 20,
          assignee: null,
          created_at: 1_100
        }
      ]
    }
  ]
}

const detail = {
  task: { ...board.columns[0].tasks[0], body: 'Build it natively.', workspace_path: 'C:/repo' },
  comments: [{ id: 1, task_id: 't_ready', author: 'hannes', body: 'Please continue', created_at: 1_500 }],
  links: { parents: [], children: ['t_child'] },
  child_results: []
}

function mockRest({
  createDeferred,
  failComment = false,
  failDetail = false
}: { createDeferred?: Promise<unknown>; failComment?: boolean; failDetail?: boolean } = {}) {
  const mock = vi.fn(async (path: string, options?: { body?: unknown; method?: string }) => {
    if (path === '/boards?include_system=false') {
      return boards
    }

    if (path === '/boards?include_system=true') {
      return {
        ...boards,
        hidden_system_count: 0,
        boards: [...boards.boards, { slug: 'delegation-1', label: 'Delegation 1', total: 0, counts: {}, system: true }]
      }
    }

    if (path === '/board?board=default') {
      return board
    }

    if (path === '/tasks/t_ready?board=default') {
      if (failDetail) {
        throw new Error('detail failed')
      }

      return detail
    }

    if (path === '/tasks/t_child?board=default') {
      return { ...detail, task: { ...detail.task, id: 't_child', title: 'Child task' } }
    }

    if (path === '/tasks/t_ready/comments?board=default' && options?.method === 'POST') {
      if (failComment) {
        throw new Error('comment failed')
      }

      return { ok: true }
    }

    if (path === '/tasks?board=default' && options?.method === 'POST' && createDeferred) {
      return createDeferred
    }

    if (options?.method === 'PATCH' || options?.method === 'POST') {
      return { ok: true, task: detail.task }
    }

    throw new Error(`Unexpected request: ${path}`)
  })

  return mock as unknown as KanbanRest & typeof mock
}

function renderPage(rest: KanbanRest) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

  const rendered = render(
    <QueryClientProvider client={client}>
      <KanbanPage rest={rest} />
    </QueryClientProvider>
  )

  return { ...rendered, client }
}

function setActiveProfile(profile: string) {
  const profileAtom = host.state.profile as unknown as { set: (value: string) => void }

  profileAtom.set(profile)
}

afterEach(() => {
  cleanup()
  setActiveProfile('default')
  vi.clearAllMocks()
})

describe('Kanban desktop plugin', () => {
  it('renders user boards and all workflow columns without hiding later states', async () => {
    const rest = mockRest()
    renderPage(rest)

    expect(await screen.findByText('Ship desktop board')).toBeTruthy()
    expect(screen.getByText('Needs human input')).toBeTruthy()
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0)
    expect(screen.getByText('2 tasks')).toBeTruthy()
  })

  it('updates status navigation counts to match search-filtered cards', async () => {
    const rest = mockRest()
    renderPage(rest)

    await screen.findByText('Ship desktop board')
    fireEvent.change(screen.getByLabelText('Search tasks…'), { target: { value: 'human input' } })

    expect(screen.queryByText('Ship desktop board')).toBeNull()
    expect(screen.getByText('Needs human input')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ready0' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Blocked1' })).toBeTruthy()
  })

  it('reveals technical delegation boards only after the explicit toggle', async () => {
    const rest = mockRest()
    renderPage(rest)

    fireEvent.click(await screen.findByRole('button', { name: 'Show delegations (1)' }))

    await waitFor(() => expect(rest).toHaveBeenCalledWith('/boards?include_system=true'))
    expect(await screen.findByRole('option', { name: 'Delegation 1 · 0' })).toBeTruthy()
  })

  it('keeps backend-added workflow columns and their tasks visible', async () => {
    const baseRest = mockRest()

    const rest = vi.fn(async (path: string, options?: { body?: unknown; method?: string }) => {
      if (path === '/board?board=default') {
        return {
          ...board,
          columns: [
            ...board.columns,
            {
              name: 'quality-gate',
              tasks: [{ ...board.columns[0].tasks[0], id: 't_quality', status: 'quality-gate', title: 'Quality gate task' }]
            }
          ]
        }
      }

      return baseRest(path, options)
    }) as unknown as KanbanRest & ReturnType<typeof vi.fn>

    renderPage(rest)

    expect(await screen.findByText('Quality gate task')).toBeTruthy()
    expect(screen.getAllByText('Quality Gate').length).toBeGreaterThan(0)
    expect(screen.getByText('3 tasks')).toBeTruthy()
  })

  it('shows an honest empty state and removes a selected delegation board when hidden', async () => {
    const systemBoard = { slug: 'delegation-1', label: 'Delegation 1', total: 1, counts: { ready: 1 }, system: true }

    const rest = vi.fn(async (path: string) => {
      if (path === '/boards?include_system=false') {
        return { boards: [], current: 'delegation-1', hidden_system_count: 1 }
      }

      if (path === '/boards?include_system=true') {
        return { boards: [systemBoard], current: 'delegation-1', hidden_system_count: 0 }
      }

      if (path === '/board?board=delegation-1') {
        return { ...board, columns: [{ name: 'ready', tasks: [{ ...board.columns[0].tasks[0], title: 'Internal task' }] }] }
      }

      throw new Error(`Unexpected request: ${path}`)
    }) as unknown as KanbanRest & ReturnType<typeof vi.fn>

    renderPage(rest)

    expect(await screen.findAllByText('No user boards are available.')).toHaveLength(2)
    expect(screen.queryByText('Loading board…')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show delegations (1)' }))
    expect(await screen.findByText('Internal task')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hide delegations' }))
    await waitFor(() => expect(screen.queryByText('Internal task')).toBeNull())
    expect(screen.getAllByText('No user boards are available.').length).toBeGreaterThan(0)
  })

  it('opens task details and persists a status transition through the plugin API', async () => {
    const rest = mockRest()
    renderPage(rest)

    fireEvent.click(await screen.findByRole('button', { name: /Ship desktop board/ }))
    expect(await screen.findByText('Build it natively.')).toBeTruthy()
    expect(screen.getByText('Please continue')).toBeTruthy()

    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Complete' }))

    await waitFor(() =>
      expect(rest).toHaveBeenCalledWith('/tasks/t_ready?board=default', {
        method: 'PATCH',
        body: { status: 'done' }
      })
    )
  })

  it('shows retryable task errors and lets dependency ids open their task', async () => {
    const failingRest = mockRest({ failDetail: true })
    renderPage(failingRest)

    fireEvent.click(await screen.findByRole('button', { name: /Ship desktop board/ }))
    expect(await screen.findByText('Task details could not be loaded.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()

    cleanup()
    const rest = mockRest()
    renderPage(rest)
    fireEvent.click(await screen.findByRole('button', { name: /Ship desktop board/ }))
    fireEvent.click(await screen.findByRole('button', { name: '↓ t_child' }))
    expect(await screen.findByText('Child task')).toBeTruthy()
  })

  it('creates a triage task from the native desktop dialog', async () => {
    const rest = mockRest()
    renderPage(rest)

    fireEvent.click(await screen.findByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Native task' } })
    fireEvent.change(screen.getByLabelText('Description and acceptance criteria'), {
      target: { value: 'Created from Electron' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(rest).toHaveBeenCalledWith('/tasks?board=default', {
        method: 'POST',
        body: { title: 'Native task', body: 'Created from Electron', triage: true }
      })
    )
  })

  it('closes create intent on profile switch and invalidates the mutation origin', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined

    const createDeferred = new Promise(resolve => {
      resolveCreate = resolve
    })

    const rest = mockRest({ createDeferred })
    const { client } = renderPage(rest)
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    fireEvent.click(await screen.findByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Old profile intent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(rest).toHaveBeenCalledWith('/tasks?board=default', expect.anything()))

    act(() => setActiveProfile('other'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    resolveCreate({ ok: true })
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['desktop-kanban', 'default', 'board', 'default'] })
    )
  })

  it('keeps a comment draft when the backend rejects the mutation', async () => {
    const rest = mockRest({ failComment: true })
    renderPage(rest)

    fireEvent.click(await screen.findByRole('button', { name: /Ship desktop board/ }))
    const input = await screen.findByLabelText('Add context for the worker…')
    fireEvent.change(input, { target: { value: 'Do not lose this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))

    await waitFor(() =>
      expect(rest).toHaveBeenCalledWith('/tasks/t_ready/comments?board=default', {
        method: 'POST',
        body: { author: 'desktop', body: 'Do not lose this draft' }
      })
    )
    expect((input as HTMLInputElement).value).toBe('Do not lose this draft')
  })
})
