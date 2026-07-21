import { type HermesPlugin, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'

import { KanbanPage } from './page'

const plugin: HermesPlugin = {
  id: 'kanban',
  name: 'Kanban',
  defaultEnabled: true,
  register(ctx) {
    ctx.i18n.register({
      en: {
        title: 'Kanban',
        board: 'Board',
        task: 'Task',
        taskCount: (count: number) => `${count} tasks`,
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
        showDelegations: (count: number) => `Show delegations (${count})`,
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
        status: {
          triage: 'Triage',
          todo: 'Todo',
          scheduled: 'Scheduled',
          ready: 'Ready',
          running: 'In Progress',
          blocked: 'Blocked',
          review: 'Review',
          done: 'Done'
        },
        errors: {
          create: 'Could not create the task',
          update: 'Could not update the task',
          comment: 'Could not add the comment'
        }
      }
    })

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        title: 'Kanban',
        data: { path: '/kanban' },
        render: () => <KanbanPage rest={ctx.rest} />
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 40,
        data: { path: '/kanban', label: 'Kanban', codicon: 'project' }
      }
    ])
  }
}

export default plugin
