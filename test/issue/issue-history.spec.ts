import { describe, expect, it } from 'vitest';
import { diffIssue } from '../../src/issue/issue-history.js';

describe('diffIssue', () => {
  const current = {
    status: 'OPEN',
    priority: 'MEDIUM',
    assigneeId: null,
  } as const;

  it('no registra nada si no se envía ningún campo con seguimiento', () => {
    expect(diffIssue(current, {})).toEqual([]);
  });

  it('no registra nada si el valor enviado es el que ya tiene', () => {
    expect(
      diffIssue(current, {
        status: 'OPEN',
        priority: 'MEDIUM',
        assigneeId: null,
      }),
    ).toEqual([]);
  });

  it('registra el cambio de estado con el valor anterior y el nuevo', () => {
    expect(diffIssue(current, { status: 'CLOSED' })).toEqual([
      { type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'CLOSED' },
    ]);
  });

  it('registra un evento por cada campo que cambia, en orden fijo', () => {
    expect(
      diffIssue(current, {
        assigneeId: 'user-2',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
      }),
    ).toEqual([
      { type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'IN_PROGRESS' },
      { type: 'PRIORITY_CHANGED', oldValue: 'MEDIUM', newValue: 'HIGH' },
      { type: 'ASSIGNEE_CHANGED', oldValue: null, newValue: 'user-2' },
    ]);
  });

  it('registra la asignación, el cambio y la retirada del responsable', () => {
    expect(diffIssue(current, { assigneeId: 'user-2' })).toEqual([
      { type: 'ASSIGNEE_CHANGED', oldValue: null, newValue: 'user-2' },
    ]);
    expect(
      diffIssue({ ...current, assigneeId: 'user-2' }, { assigneeId: 'user-3' }),
    ).toEqual([
      { type: 'ASSIGNEE_CHANGED', oldValue: 'user-2', newValue: 'user-3' },
    ]);
    expect(
      diffIssue({ ...current, assigneeId: 'user-2' }, { assigneeId: null }),
    ).toEqual([
      { type: 'ASSIGNEE_CHANGED', oldValue: 'user-2', newValue: null },
    ]);
  });

  it('ignora los campos sin seguimiento', () => {
    expect(
      diffIssue(current, { title: 'Nuevo', description: 'Texto' } as never),
    ).toEqual([]);
  });
});
