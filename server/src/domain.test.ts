import test from 'node:test'; import assert from 'node:assert/strict'; import { containerPlan, dashboard, gateCancel, gateCheckIn, gateComplete, GateFlowError, gateReopen, gateVerify, gateConflicts, prioritizeTasks } from './domain.js';
test('dashboard aggregates berth, yard, gate and exception signals', () => { const data = dashboard(); assert.equal(data.activeVoyages, 2); assert.ok(data.yardUtilization > 0.7); assert.ok(data.blockedTasks >= 1); });
test('gate conflict engine detects same truck overlap', () => { const conflicts = gateConflicts(); assert.ok(conflicts.some(item => item.appointmentId === 'APT-9001' || item.appointmentId === 'APT-9004')); });
test('yard planner respects reefer and hazmat constraints', () => { const plan = containerPlan('TGHU-9831204'); assert.equal(plan?.recommendedBlock?.hazmatAllowed, true); assert.ok(plan?.reasons.some(reason => reason.includes('危险品'))); });
test('priority queue promotes customs inspection work', () => { const tasks = prioritizeTasks(); assert.equal(tasks[0].containerId, 'TGHU-9831204'); });

test('container create, update and delete form a complete audited CRUD cycle', async () => {
  const { createContainer, updateContainer, deleteContainer, containers } = await import('./domain.js');
  const created = createContainer({ id: 'TEST-CRUD-0001', voyageId: 'VOY-AX7', size: '20', isoType: '22G1', direction: 'import', status: 'in-yard', weightT: 10, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R11-T1' });
  assert.equal(created.id, 'TEST-CRUD-0001');
  assert.equal(updateContainer(created.id, { weightT: 12 })?.weightT, 12);
  assert.equal(deleteContainer(created.id)?.id, 'TEST-CRUD-0001');
  assert.equal(containers.some(item => item.id === 'TEST-CRUD-0001'), false);
});

test('appointment and task domain operations support create, update and delete', async () => {
  const { createGateAppointment, editGateAppointment, deleteGateAppointment, createYardTask, updateYardTask, deleteYardTask } = await import('./domain.js');
  const appointment = createGateAppointment({ containerId: 'MSCU-4829017', truckNo: 'TEST-CRUD-01', driver: '测试司机', type: 'pickup', windowStart: new Date(Date.now()+3600000).toISOString(), windowEnd: new Date(Date.now()+7200000).toISOString(), lane: 'north' });
  assert.equal(editGateAppointment(appointment.id, { driver: '更新司机' })?.driver, '更新司机');
  assert.equal(deleteGateAppointment(appointment.id)?.id, appointment.id);
  const task = createYardTask({ kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R01-T1', to: '南闸口', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 12 });
  assert.equal(updateYardTask(task.id, { to: '北闸口' })?.to, '北闸口');
  assert.equal(deleteYardTask(task.id)?.id, task.id);
});

test('gate flow enforces check-in, seal/weight evidence and completion in order', async () => {
  const { createGateAppointment, deleteGateAppointment, containers } = await import('./domain.js');
  const appointment = createGateAppointment({ containerId: 'MSCU-4829017', truckNo: 'TEST-GATE-01', driver: '流程司机', type: 'pickup', windowStart: new Date(Date.now() + 3600000).toISOString(), windowEnd: new Date(Date.now() + 7200000).toISOString(), lane: 'north' });
  const container = containers.find(item => item.id === 'MSCU-4829017')!;
  try {
    // 未签到不能登记证据，也不能办结
    assert.throws(() => gateComplete(appointment.id), GateFlowError);
    assert.throws(() => gateVerify(appointment.id, 'sealVerified', true), GateFlowError);

    // 签到：显示箱号与预约类型，箱务状态同步为闸口在场
    const checkedIn = gateCheckIn(appointment.id);
    assert.equal(checkedIn.appointment.status, 'checked-in');
    assert.equal(checkedIn.container.status, 'at-gate');
    assert.match(checkedIn.message, /MSCU-4829017/);
    assert.match(checkedIn.message, /提箱/);

    // 重复签到被状态机拒绝并给出原因
    assert.throws(() => gateCheckIn(appointment.id), error => error instanceof GateFlowError && /重复签到/.test(error.reasons[0]));

    // 证据不齐时办结，逐条说明缺失的证据
    let missing: unknown;
    try { gateComplete(appointment.id); } catch (error) { missing = error; }
    assert.ok(missing instanceof GateFlowError, '证据不齐时办结应当被拦截');
    assert.ok(missing.reasons.some(reason => reason.includes('封志')));
    assert.ok(missing.reasons.some(reason => reason.includes('称重')));

    gateVerify(appointment.id, 'sealVerified', true);
    gateVerify(appointment.id, 'weightVerified', true);
    const completed = gateComplete(appointment.id);
    assert.equal(completed.appointment.status, 'completed');
    assert.equal(completed.container.status, 'released');
    assert.equal(completed.containerStatusChanged, true);

    // 办结后重复完成与证据改录都被拒绝
    assert.throws(() => gateComplete(appointment.id), GateFlowError);
    assert.throws(() => gateVerify(appointment.id, 'sealVerified', false), GateFlowError);

    container.status = 'in-yard';
  } finally {
    deleteGateAppointment(appointment.id);
  }
});

test('seeded checked-in appointment with full evidence completes the drop-off', () => {
  const before = gateVerify('APT-9001', 'sealVerified', true);
  gateVerify('APT-9001', 'weightVerified', true);
  assert.equal(before.appointment.status, 'checked-in');
  const completed = gateComplete('APT-9001');
  assert.equal(completed.appointment.status, 'completed');
  assert.equal(completed.container.status, 'in-yard'); // 进场办结 -> 场内堆存
});

test('customs inspection container cannot complete pickup until released', async () => {
  const { createGateAppointment, deleteGateAppointment, updateContainer, containers } = await import('./domain.js');
  // 直接构造一条查验中箱的预约（绕过创建时的提箱限制，模拟海关状态在签到后恶化）
  const appointment = createGateAppointment({ containerId: 'TEMU-1774029', truckNo: 'TEST-GATE-02', driver: '查验司机', type: 'dropoff', windowStart: new Date(Date.now() + 3600000).toISOString(), windowEnd: new Date(Date.now() + 7200000).toISOString(), lane: 'north' });
  const container = containers.find(item => item.id === 'TEMU-1774029')!;
  try {
    gateCheckIn(appointment.id);
    gateVerify(appointment.id, 'sealVerified', true);
    gateVerify(appointment.id, 'weightVerified', true);
    let blocked: unknown;
    try { gateComplete(appointment.id); } catch (error) { blocked = error; }
    assert.ok(blocked instanceof GateFlowError, '海关查验中时办结应当被拦截');
    assert.ok(blocked.reasons.some(reason => reason.includes('海关')), blocked.reasons.join('；'));
    assert.equal(container.status, 'at-gate'); // 海关未放行，箱务状态不得推进
    updateContainer('TEMU-1774029', { customs: 'released' });
    const done = gateComplete(appointment.id);
    assert.equal(done.container.status, 'in-yard');
    updateContainer('TEMU-1774029', { customs: 'inspection' });
    container.status = 'in-yard';
  } finally {
    deleteGateAppointment(appointment.id);
  }
});

test('cancelled appointment can be reopened and the full flow stays consistent', async () => {
  const { createGateAppointment, deleteGateAppointment, containers } = await import('./domain.js');
  const appointment = createGateAppointment({ containerId: 'FCIU-9920310', truckNo: 'TEST-GATE-03', driver: '取消司机', type: 'pickup', windowStart: new Date(Date.now() + 3600000).toISOString(), windowEnd: new Date(Date.now() + 7200000).toISOString(), lane: 'south' });
  const container = containers.find(item => item.id === 'FCIU-9920310')!;
  try {
    gateCheckIn(appointment.id);
    gateVerify(appointment.id, 'sealVerified', true);
    assert.equal(container.status, 'at-gate');
    const cancelled = gateCancel(appointment.id);
    assert.equal(cancelled.appointment.status, 'cancelled');
    assert.equal(cancelled.appointment.sealVerified, false); // 取消后证据重置
    assert.notEqual(container.status, 'at-gate'); // 已签到箱退回签到前状态
    // 重复取消、取消态直接签到都被拒绝
    assert.throws(() => gateCancel(appointment.id), GateFlowError);
    assert.throws(() => gateCheckIn(appointment.id), GateFlowError);
    // 恢复后重新走完整链路
    gateReopen(appointment.id);
    gateCheckIn(appointment.id);
    gateVerify(appointment.id, 'sealVerified', true);
    gateVerify(appointment.id, 'weightVerified', true);
    const done = gateComplete(appointment.id);
    assert.equal(done.appointment.status, 'completed');
    assert.equal(done.container.status, 'released');
    container.status = 'in-yard';
  } finally {
    deleteGateAppointment(appointment.id);
  }
});
