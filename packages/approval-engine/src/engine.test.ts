import { describe, it, expect } from 'vitest';
import { instantiateWorkflow, advance } from './engine.js';
import type { ApprovalWorkflow } from '@ces/domain';

const wfId = '00000000-0000-0000-0000-000000000001';
const subject = '00000000-0000-0000-0000-000000000002';
const requester = '00000000-0000-0000-0000-00000000aaaa';
const manager = '00000000-0000-0000-0000-00000000bbbb';
const finance = '00000000-0000-0000-0000-00000000cccc';
const director = '00000000-0000-0000-0000-00000000dddd';
const now = '2025-03-10T10:00:00.000Z';

const wf: ApprovalWorkflow = {
  id: wfId,
  appliesTo: 'EXPENSE',
  name: 'Standard expense workflow',
  active: true,
  steps: [
    { order: 0, name: 'Manager', approverKind: 'REPORTING_MANAGER' },
    {
      order: 1,
      name: 'Finance',
      approverKind: 'ROLE',
      approverRole: 'FINANCE',
      minAmount: '5000.00',
    },
    {
      order: 2,
      name: 'Director',
      approverKind: 'NAMED_USER',
      approverUserId: director,
      minAmount: '50000.00',
    },
  ],
};

describe('instantiateWorkflow', () => {
  it('routes through manager only when amount is below all thresholds', () => {
    const inst = instantiateWorkflow({
      workflow: wf,
      subjectId: subject,
      amount: '1000.00',
      requester: { userId: requester, reportingManagerId: manager, roles: ['ENGINEER'] },
      resolveRoleApprover: (r) => (r === 'FINANCE' ? finance : null),
      now,
    });
    expect(inst.status).toBe('PENDING');
    expect(inst.steps.map((s) => s.result)).toEqual(['PENDING', 'SKIPPED', 'SKIPPED']);
    expect(inst.steps[0]?.approverUserId).toBe(manager);
  });

  it('routes manager → finance for mid threshold', () => {
    const inst = instantiateWorkflow({
      workflow: wf,
      subjectId: subject,
      amount: '10000.00',
      requester: { userId: requester, reportingManagerId: manager, roles: ['ENGINEER'] },
      resolveRoleApprover: () => finance,
      now,
    });
    expect(inst.steps.map((s) => s.result)).toEqual(['PENDING', 'PENDING', 'SKIPPED']);
  });

  it('routes manager → finance → director above top threshold', () => {
    const inst = instantiateWorkflow({
      workflow: wf,
      subjectId: subject,
      amount: '75000.00',
      requester: { userId: requester, reportingManagerId: manager, roles: ['ENGINEER'] },
      resolveRoleApprover: () => finance,
      now,
    });
    expect(inst.steps.map((s) => s.result)).toEqual(['PENDING', 'PENDING', 'PENDING']);
    expect(inst.steps[2]?.approverUserId).toBe(director);
  });

  it('auto-approves if every step is skipped', () => {
    const tinyWf: ApprovalWorkflow = {
      ...wf,
      steps: [
        {
          order: 0,
          name: 'Finance',
          approverKind: 'ROLE',
          approverRole: 'FINANCE',
          minAmount: '10000.00',
        },
      ],
    };
    const inst = instantiateWorkflow({
      workflow: tinyWf,
      subjectId: subject,
      amount: '50.00',
      requester: { userId: requester, reportingManagerId: manager, roles: ['ENGINEER'] },
      resolveRoleApprover: () => finance,
      now,
    });
    expect(inst.status).toBe('APPROVED');
  });
});

describe('advance', () => {
  function buildInstance(amount = '10000.00') {
    return instantiateWorkflow({
      workflow: wf,
      subjectId: subject,
      amount,
      requester: { userId: requester, reportingManagerId: manager, roles: ['ENGINEER'] },
      resolveRoleApprover: () => finance,
      now,
    });
  }

  it('advances to next pending step on approve', () => {
    const inst = buildInstance();
    const { instance, terminal } = advance({
      instance: inst,
      actorUserId: manager,
      decision: 'APPROVE',
      now,
    });
    expect(terminal).toBe(false);
    expect(instance.status).toBe('PENDING');
    expect(instance.steps[0]?.result).toBe('APPROVED');
    expect(instance.steps[1]?.result).toBe('PENDING');
  });

  it('marks instance APPROVED when no pending steps remain', () => {
    let inst = buildInstance();
    inst = advance({ instance: inst, actorUserId: manager, decision: 'APPROVE', now }).instance;
    const final = advance({ instance: inst, actorUserId: finance, decision: 'APPROVE', now });
    expect(final.terminal).toBe(true);
    expect(final.instance.status).toBe('APPROVED');
  });

  it('rejecting at any step terminates with REJECTED', () => {
    const inst = buildInstance('75000.00');
    const result = advance({
      instance: inst,
      actorUserId: manager,
      decision: 'REJECT',
      comment: 'Out of policy',
      now,
    });
    expect(result.terminal).toBe(true);
    expect(result.instance.status).toBe('REJECTED');
    expect(result.instance.steps[0]?.comment).toBe('Out of policy');
  });

  it('rejects when actor is not the current approver', () => {
    const inst = buildInstance();
    expect(() =>
      advance({ instance: inst, actorUserId: finance, decision: 'APPROVE', now }),
    ).toThrow(/is not the approver/);
  });

  it('rejects acting on a terminal instance', () => {
    let inst = buildInstance();
    inst = advance({ instance: inst, actorUserId: manager, decision: 'REJECT', now }).instance;
    expect(() =>
      advance({ instance: inst, actorUserId: manager, decision: 'APPROVE', now }),
    ).toThrow(/already REJECTED/);
  });
});
