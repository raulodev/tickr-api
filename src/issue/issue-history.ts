import type { IssuePriority, IssueStatus } from '../generated/prisma/client.js';

export type IssueChange = {
  type: 'STATUS_CHANGED' | 'PRIORITY_CHANGED' | 'ASSIGNEE_CHANGED';
  oldValue: string | null;
  newValue: string | null;
};

type Tracked = {
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string | null;
};

/** Compara los campos con seguimiento. `undefined` significa "no tocar". */
export function diffIssue(
  current: Required<Tracked>,
  dto: Tracked,
): IssueChange[] {
  const changes: IssueChange[] = [];

  if (dto.status !== undefined && dto.status !== current.status) {
    changes.push({
      type: 'STATUS_CHANGED',
      oldValue: current.status,
      newValue: dto.status,
    });
  }
  if (dto.priority !== undefined && dto.priority !== current.priority) {
    changes.push({
      type: 'PRIORITY_CHANGED',
      oldValue: current.priority,
      newValue: dto.priority,
    });
  }
  if (dto.assigneeId !== undefined && dto.assigneeId !== current.assigneeId) {
    changes.push({
      type: 'ASSIGNEE_CHANGED',
      oldValue: current.assigneeId,
      newValue: dto.assigneeId,
    });
  }
  return changes;
}
