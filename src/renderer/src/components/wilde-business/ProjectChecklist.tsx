import { Button } from '@/components/ui/button'
import type { Assignment, DeliveryProject, Task } from '../../../../shared/wilde/domain'

// Linked Orca projects, the task checklist and their actions for one project card.
export function ProjectChecklist({
  project,
  assignments,
  tasks,
  busy,
  onEditTask,
  onToggleTask,
  onNewTask,
  onLinkTarget
}: {
  project: DeliveryProject
  assignments: Assignment[]
  tasks: Task[]
  busy: boolean
  onEditTask: (task: Task) => void
  onToggleTask: (task: Task) => void
  onNewTask: (projectId: string) => void
  onLinkTarget: (projectId: string) => void
}): React.JSX.Element {
  const linked = assignments.filter((item) => item.projectId === project.id && !item.archivedAt)
  return (
    <>
      {linked.length > 0 && (
        <p className="text-xs text-muted-foreground break-words">
          Linked: {linked.map((item) => item.target.name).join(', ')}
        </p>
      )}
      <ul aria-label={`${project.title} checklist`} className="space-y-1">
        {tasks
          .filter((task) => task.projectId === project.id)
          .map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                aria-label={task.title}
                checked={task.done}
                disabled={busy}
                onChange={() => onToggleTask(task)}
              />
              <button
                type="button"
                className={task.done ? 'text-left line-through' : 'text-left'}
                disabled={busy}
                onClick={() => onEditTask(task)}
              >
                {task.title}
              </button>
              {task.dueDate && (
                <span className="text-xs text-muted-foreground">Due {task.dueDate}</span>
              )}
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !!project.archivedAt}
          onClick={() => onNewTask(project.id)}
        >
          Add task
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !!project.archivedAt}
          onClick={() => onLinkTarget(project.id)}
        >
          Link Orca project
        </Button>
      </div>
    </>
  )
}
