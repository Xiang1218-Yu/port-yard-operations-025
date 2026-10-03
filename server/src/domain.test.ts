import test from 'node:test'; import assert from 'node:assert/strict'; import { containerPlan, dashboard, gateConflicts, prioritizeTasks } from './domain.js';
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

test('gate staged workflow enforces order, evidence and container sync', async () => {
  const { createContainer, createGateAppointment, checkInAppointment, verifyAppointment, completeAppointment, deleteContainer, containers } = await import('./domain.js');
  createContainer({ id: 'TEST-GATE-0001', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'export', status: 'at-gate', weightT: 20, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R09-T1' });
  const appointment = createGateAppointment({ containerId: 'TEST-GATE-0001', truckNo: 'TEST-GATE-01', driver: '测试司机', type: 'dropoff', windowStart: new Date(Date.now()+3600000).toISOString(), windowEnd: new Date(Date.now()+7200000).toISOString(), lane: 'south' });
  assert.throws(() => verifyAppointment(appointment.id, { sealVerified: true }), /尚未签到/);
  assert.throws(() => completeAppointment(appointment.id), /尚未签到/);
  const checkedIn = checkInAppointment(appointment.id);
  assert.equal(checkedIn?.appointment.status, 'checked-in');
  assert.equal(containers.find(item => item.id === 'TEST-GATE-0001')?.status, 'at-gate');
  assert.throws(() => checkInAppointment(appointment.id), /已签到/);
  assert.throws(() => completeAppointment(appointment.id), /封志校验未通过；称重校验未通过/);
  verifyAppointment(appointment.id, { sealVerified: true });
  assert.throws(() => completeAppointment(appointment.id), /称重校验未通过/);
  verifyAppointment(appointment.id, { weightVerified: true });
  const completed = completeAppointment(appointment.id);
  assert.equal(completed?.appointment.status, 'completed');
  assert.equal(completed?.container?.status, 'in-yard');
  assert.throws(() => completeAppointment(appointment.id), /已完成/);
  deleteContainer('TEST-GATE-0001');
});

test('pickup completion reports customs reason and syncs released status', async () => {
  const { createContainer, createGateAppointment, checkInAppointment, verifyAppointment, completeAppointment, updateContainer, deleteContainer, containers } = await import('./domain.js');
  createContainer({ id: 'TEST-GATE-0002', voyageId: 'VOY-AX7', size: '20', isoType: '22G1', direction: 'import', status: 'in-yard', weightT: 12, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R10-T1' });
  const appointment = createGateAppointment({ containerId: 'TEST-GATE-0002', truckNo: 'TEST-GATE-02', driver: '测试司机', type: 'pickup', windowStart: new Date(Date.now()+3600000).toISOString(), windowEnd: new Date(Date.now()+7200000).toISOString(), lane: 'north' });
  checkInAppointment(appointment.id);
  verifyAppointment(appointment.id, { sealVerified: true, weightVerified: true });
  updateContainer('TEST-GATE-0002', { customs: 'hold' });
  assert.throws(() => completeAppointment(appointment.id), /海关状态为扣留，未放行/);
  updateContainer('TEST-GATE-0002', { customs: 'released' });
  const completed = completeAppointment(appointment.id);
  assert.equal(completed?.container?.status, 'released');
  assert.equal(containers.find(item => item.id === 'TEST-GATE-0002')?.status, 'released');
  deleteContainer('TEST-GATE-0002');
});
