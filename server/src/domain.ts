export type ContainerStatus = 'in-transit' | 'at-gate' | 'in-yard' | 'on-quay' | 'released' | 'hold';
export type EquipmentKind = 'quay-crane' | 'yard-crane' | 'terminal-truck' | 'reach-stacker';
export type TaskStatus = 'queued' | 'assigned' | 'executing' | 'blocked' | 'done';
export type AppointmentStatus = 'booked' | 'checked-in' | 'completed' | 'cancelled' | 'exception';

export interface Voyage { id: string; vessel: string; imo: string; service: string; eta: string; etd: string; status: 'approaching' | 'berthed' | 'loading' | 'departed'; berth: string; movesPlanned: number; movesDone: number; lateRisk: 'low' | 'medium' | 'high'; }
export interface Container { id: string; voyageId: string; size: '20' | '40' | '45'; isoType: string; direction: 'import' | 'export' | 'transshipment'; status: ContainerStatus; weightT: number; reefer: boolean; temperature?: number; hazmatClass?: string; customs: 'released' | 'inspection' | 'hold'; priority: 'normal' | 'hot' | 'reefer' | 'hazmat'; yardSlot: string; appointmentId?: string; lastEvent: string; }
export interface YardBlock { id: string; zone: string; rows: number; tiers: number; capacity: number; occupied: number; reeferPlugs: number; usedPlugs: number; hazmatAllowed: boolean; equipment: EquipmentKind[]; heat: number; }
export interface GateAppointment { id: string; containerId: string; truckNo: string; driver: string; type: 'pickup' | 'dropoff'; windowStart: string; windowEnd: string; lane: 'north' | 'south' | 'rail'; status: AppointmentStatus; sealVerified: boolean; weightVerified: boolean; checkedInAt?: string; completedAt?: string; cancelledAt?: string; statusBeforeCheckIn?: ContainerStatus; exception?: string; }
export interface Equipment { id: string; name: string; kind: EquipmentKind; status: 'available' | 'working' | 'maintenance' | 'offline'; location: string; battery: number; queue: number; movesPerHour: number; }
export interface YardTask { id: string; kind: 'receive' | 'deliver' | 'rehandle' | 'load' | 'discharge' | 'inspect'; containerId: string; from: string; to: string; equipmentId?: string; priority: number; status: TaskStatus; scheduledAt: string; blockingReasons: string[]; estimatedMinutes: number; }
export interface AuditEvent { id: string; actor: string; action: string; entity: string; entityId: string; at: string; details: string; }

const start = Date.now(); const iso = (minutes: number) => new Date(start + minutes * 60000).toISOString();
export const voyages: Voyage[] = [
  { id: 'VOY-AX7', vessel: 'MSC Aurora', imo: 'IMO9382014', service: 'AE-3', eta: iso(-90), etd: iso(350), status: 'berthed', berth: 'B07', movesPlanned: 1240, movesDone: 886, lateRisk: 'medium' },
  { id: 'VOY-QF2', vessel: 'Ever Quartz', imo: 'IMO9721103', service: 'TP9', eta: iso(190), etd: iso(890), status: 'approaching', berth: 'B04', movesPlanned: 760, movesDone: 0, lateRisk: 'high' },
  { id: 'VOY-RD8', vessel: 'ONE Redwood', imo: 'IMO9812340', service: 'PNW', eta: iso(-700), etd: iso(-330), status: 'departed', berth: 'B02', movesPlanned: 520, movesDone: 520, lateRisk: 'low' }
];
export const blocks: YardBlock[] = [
  { id: 'A01', zone: 'North Import', rows: 14, tiers: 5, capacity: 280, occupied: 247, reeferPlugs: 18, usedPlugs: 16, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 78 },
  { id: 'B07', zone: 'Central Transshipment', rows: 18, tiers: 5, capacity: 360, occupied: 302, reeferPlugs: 24, usedPlugs: 19, hazmatAllowed: true, equipment: ['yard-crane', 'reach-stacker', 'terminal-truck'], heat: 91 },
  { id: 'C03', zone: 'Export Pre-staging', rows: 12, tiers: 4, capacity: 192, occupied: 128, reeferPlugs: 8, usedPlugs: 3, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 54 },
  { id: 'D05', zone: 'Inspection & Hold', rows: 8, tiers: 3, capacity: 96, occupied: 72, reeferPlugs: 5, usedPlugs: 4, hazmatAllowed: true, equipment: ['reach-stacker'], heat: 63 }
];
export const containers: Container[] = [
  { id: 'MSCU-4829017', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'import', status: 'in-yard', weightT: 22.4, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'A01-R07-T3', lastEvent: '卸船完成 08:42' },
  { id: 'EISU-1288420', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 27.8, reefer: true, temperature: -18, customs: 'released', priority: 'reefer', yardSlot: 'B07-R03-T2', lastEvent: '温度回传正常 08:51' },
  { id: 'TGHU-9831204', voyageId: 'VOY-AX7', size: '20', isoType: '22K2', direction: 'transshipment', status: 'hold', weightT: 19.7, reefer: false, hazmatClass: '3', customs: 'inspection', priority: 'hazmat', yardSlot: 'D05-R02-T1', lastEvent: '海关查验挂起' },
  { id: 'OOLU-7734201', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'export', status: 'at-gate', weightT: 24.1, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R06-T1', appointmentId: 'APT-9001', lastEvent: '南闸口已称重' },
  { id: 'CMAU-6001722', voyageId: 'VOY-QF2', size: '40', isoType: '45G1', direction: 'import', status: 'in-transit', weightT: 23.5, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'B07-R10-T1', lastEvent: '船期 ETA +35min' },
  { id: 'FCIU-9920310', voyageId: 'VOY-QF2', size: '20', isoType: '22G1', direction: 'export', status: 'in-yard', weightT: 12.2, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R04-T2', lastEvent: '待装船' },
  { id: 'TEMU-1774029', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 26.3, reefer: true, temperature: 4, customs: 'inspection', priority: 'reefer', yardSlot: 'D05-R05-T1', lastEvent: '待海关查验' }
];
export const appointments: GateAppointment[] = [
  { id: 'APT-9001', containerId: 'OOLU-7734201', truckNo: '沪A·7K229', driver: '陈海', type: 'dropoff', windowStart: iso(-14), windowEnd: iso(16), lane: 'south', status: 'checked-in', sealVerified: true, weightVerified: true, checkedInAt: iso(-6) },
  { id: 'APT-9002', containerId: 'MSCU-4829017', truckNo: '苏E·66218', driver: '王建国', type: 'pickup', windowStart: iso(34), windowEnd: iso(64), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9003', containerId: 'EISU-1288420', truckNo: '沪B·02891', driver: '赵晨', type: 'pickup', windowStart: iso(38), windowEnd: iso(68), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9004', containerId: 'FCIU-9920310', truckNo: '沪A·7K229', driver: '陈海', type: 'pickup', windowStart: iso(4), windowEnd: iso(22), lane: 'south', status: 'booked', sealVerified: false, weightVerified: false, exception: '同一车辆相邻窗口过短' }
];
export const equipment: Equipment[] = [
  { id: 'QC-07', name: '岸桥 QC-07', kind: 'quay-crane', status: 'working', location: 'B07 / MSC Aurora', battery: 96, queue: 4, movesPerHour: 31 },
  { id: 'YC-12', name: '场桥 YC-12', kind: 'yard-crane', status: 'working', location: 'B07-R03', battery: 72, queue: 9, movesPerHour: 24 },
  { id: 'YC-05', name: '场桥 YC-05', kind: 'yard-crane', status: 'available', location: 'C03-R06', battery: 88, queue: 3, movesPerHour: 27 },
  { id: 'TT-31', name: '集卡 TT-31', kind: 'terminal-truck', status: 'working', location: '南闸口', battery: 61, queue: 2, movesPerHour: 8 },
  { id: 'RS-02', name: '正面吊 RS-02', kind: 'reach-stacker', status: 'maintenance', location: 'D05', battery: 34, queue: 0, movesPerHour: 14 }
];
export const tasks: YardTask[] = [
  { id: 'TASK-101', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', equipmentId: 'YC-12', priority: 92, status: 'assigned', scheduledAt: iso(12), blockingReasons: [], estimatedMinutes: 18 },
  { id: 'TASK-102', kind: 'rehandle', containerId: 'EISU-1288420', from: 'B07-R03-T2', to: 'D05-R05-T1', equipmentId: 'YC-12', priority: 88, status: 'queued', scheduledAt: iso(24), blockingReasons: ['查验区插件余量接近阈值'], estimatedMinutes: 26 },
  { id: 'TASK-103', kind: 'inspect', containerId: 'TGHU-9831204', from: 'D05-R02-T1', to: 'D05-R02-T1', priority: 125, status: 'blocked', scheduledAt: iso(4), blockingReasons: ['RS-02 维护中', '待海关查验窗口'], estimatedMinutes: 32 },
  { id: 'TASK-104', kind: 'load', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'B07 / VOY-QF2', equipmentId: 'YC-05', priority: 75, status: 'queued', scheduledAt: iso(76), blockingReasons: [], estimatedMinutes: 21 }
];
export const auditEvents: AuditEvent[] = [{ id: 'AUD-500', actor: '中控调度员', action: 'REPLAN', entity: 'voyage', entityId: 'VOY-AX7', at: new Date(start - 20 * 60000).toISOString(), details: '因 QC-07 瞬时降速，重新计算 14 个高优先级作业' }];

function parseSlot(slot: string) { const match = slot.match(/^([A-Z]\d\d)-/); return match?.[1]; }
export function dashboard() {
  const activeVoyages = voyages.filter(v => v.status !== 'departed');
  const yardCapacity = blocks.reduce((sum, block) => sum + block.capacity, 0); const yardOccupied = blocks.reduce((sum, block) => sum + block.occupied, 0);
  return { activeVoyages: activeVoyages.length, berthMoves: activeVoyages.reduce((sum, v) => sum + v.movesPlanned - v.movesDone, 0), yardUtilization: yardOccupied / yardCapacity, gateQueue: appointments.filter(a => a.status === 'checked-in').length + 7, pendingTasks: tasks.filter(t => t.status !== 'done').length, blockedTasks: tasks.filter(t => t.status === 'blocked').length, reeferAlerts: containers.filter(c => c.reefer && (c.customs === 'inspection' || (c.temperature ?? 0) > 5)).length, hazmatHolds: containers.filter(c => c.hazmatClass && c.customs !== 'released').length, lateVessels: activeVoyages.filter(v => v.lateRisk === 'high').length };
}
export function gateConflicts() {
  const result: { severity: 'critical' | 'warning'; appointmentId: string; reason: string }[] = [];
  appointments.forEach((a, index) => appointments.slice(index + 1).forEach(b => {
    const overlap = a.truckNo === b.truckNo && new Date(a.windowStart).getTime() < new Date(b.windowEnd).getTime() && new Date(b.windowStart).getTime() < new Date(a.windowEnd).getTime();
    if (overlap) result.push({ severity: 'critical', appointmentId: a.id, reason: `车辆 ${a.truckNo} 与 ${b.id} 时间窗口重叠，需重新分配闸口时隙` });
  }));
  appointments.filter(a => a.status === 'booked').forEach(a => { const container = containers.find(c => c.id === a.containerId); if (container?.customs !== 'released') result.push({ severity: 'warning', appointmentId: a.id, reason: `箱 ${a.containerId} 海关状态为 ${container?.customs}，无法无条件放行` }); });
  return result;
}
export function yardHeatmap() { return blocks.map(block => ({ ...block, utilization: block.occupied / block.capacity, freeSlots: block.capacity - block.occupied, pressure: block.heat > 85 ? 'critical' : block.heat > 65 ? 'warning' : 'normal' })); }
export function containerPlan(containerId: string) {
  const container = containers.find(c => c.id === containerId); if (!container) return undefined;
  const reasons: string[] = []; const candidates = blocks.filter(block => block.capacity > block.occupied && (!container.hazmatClass || block.hazmatAllowed) && (!container.reefer || block.reeferPlugs > block.usedPlugs));
  if (container.customs !== 'released' && container.status === 'in-yard') reasons.push('海关未放行，必须保持在查验/监管区');
  const ranked = candidates.map(block => ({ block, score: (block.capacity - block.occupied) * 2 - block.heat - (container.reefer && block.reeferPlugs - block.usedPlugs < 3 ? 18 : 0) - (container.hazmatClass && !block.hazmatAllowed ? 100 : 0) })).sort((a, b) => b.score - a.score);
  if (!ranked.length) reasons.push('没有同时满足危险品、冷藏电源与容量约束的区块');
  const selected = ranked[0]?.block; if (container.reefer && selected) reasons.push(`需要占用 ${selected.reeferPlugs - selected.usedPlugs} 个剩余冷插位中的 1 个`);
  if (container.hazmatClass) reasons.push(`危险品 ${container.hazmatClass} 级，只能进入有隔离资质的区块`);
  return { container, recommendedBlock: selected, alternatives: ranked.slice(1, 3).map(item => item.block), reasons };
}
export function prioritizeTasks() { return tasks.map(task => ({ ...task, score: task.priority + (task.blockingReasons.length ? -20 : 10) + (task.kind === 'inspect' ? 12 : 0) })).sort((a, b) => b.score - a.score); }
/** 闸口分阶段作业校验失败：携带逐条原因，供值班员定位是海关问题还是证据缺失 */
export class GateFlowError extends Error {
  constructor(public reasons: string[]) { super(reasons.join('；')); this.name = 'GateFlowError'; }
}

export type GateStage = 'check-in' | 'verify-seal' | 'verify-weight' | 'complete' | 'cancel' | 'reopen';
export interface GateFlowResult {
  stage: GateStage;
  appointment: GateAppointment;
  container: Container;
  previousContainerStatus: ContainerStatus;
  containerStatusChanged: boolean;
  message: string;
}

const gateLaneLabel: Record<GateAppointment['lane'], string> = { north: '北闸口', south: '南闸口', rail: '铁路闸口' };
export const gateTypeLabel = (type: GateAppointment['type']) => type === 'pickup' ? '提箱' : '进场';
export const customsLabel: Record<Container['customs'], string> = { released: '已放行', inspection: '查验中', hold: '扣留' };
export const containerStatusLabel: Record<ContainerStatus, string> = {
  'in-transit': '运输中', 'at-gate': '闸口在场', 'in-yard': '场内堆存', 'on-quay': '码头前沿', released: '已放行提离', hold: '挂起'
};
const clock = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function findAppointment(id: string) {
  const item = appointments.find(a => a.id === id);
  if (!item) throw new GateFlowError([`预约 ${id} 不存在，列表可能已被其他值班员刷新，请重新同步后再操作`]);
  return item;
}

function statusGuardReasons(appointment: GateAppointment, stage: Exclude<GateStage, 'verify-seal' | 'verify-weight'>): string[] {
  const { status, id } = appointment;
  if (stage === 'check-in') {
    if (status === 'checked-in') return [`车辆已于 ${appointment.checkedInAt ? clock(appointment.checkedInAt) : ''} 在${gateLaneLabel[appointment.lane]}签到，请勿重复签到`];
    if (status === 'completed') return [`该预约已于 ${appointment.completedAt ? clock(appointment.completedAt) : ''} 完成，不能重复签到；如需重新作业请先恢复预约`];
    if (status === 'cancelled') return ['预约已取消，请先点击“恢复预约”再安排车辆签到'];
  }
  if (stage === 'complete') {
    if (status === 'booked') return ['车辆尚未签到，必须先完成签到和封志/称重校验才能办结'];
    if (status === 'completed') return ['该预约已办结，箱务状态已同步，请勿重复点击完成'];
    if (status === 'cancelled') return ['预约已取消，不能办结；请先恢复预约并重新签到'];
  }
  if (stage === 'cancel') {
    if (status === 'completed') return [`预约 ${id} 已办结离场，不能取消；如需作废请走海关/闸口异常处理流程`];
    if (status === 'cancelled') return ['预约已是取消状态，无需重复取消，可直接恢复预约'];
  }
  if (stage === 'reopen') {
    if (status === 'booked') return ['预约当前就是待签到状态，可直接签到，无需恢复'];
    if (status === 'checked-in') return ['车辆已在场内签到，请直接完成封志/称重校验后办结，恢复只用于取消后的预约'];
    if (status === 'completed') return ['已办结预约不能恢复，请到箱务台账调整箱状态'];
  }
  return [];
}

/** 办结前的放行条件：封志/称重证据 + 海关状态，逐条返回不满足的原因 */
export function gateCompletionBlockers(appointment: GateAppointment): string[] {
  const reasons: string[] = [];
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) {
    reasons.push(`箱号 ${appointment.containerId} 在箱务台账中不存在，无法核对海关与证据条件`);
    return reasons;
  }
  const action = gateTypeLabel(appointment.type);
  if (!appointment.sealVerified) reasons.push(`封志未核验通过：闸口封志证据缺失，不能完成${action}`);
  if (!appointment.weightVerified) reasons.push(`称重未核验通过：地磅重量证据缺失，不能完成${action}`);
  if (container.customs === 'hold') reasons.push(`海关状态为“扣留”，${container.id} 被海关布控，请联系海关解除扣留后再${action}`);
  if (container.customs === 'inspection') {
    if (appointment.type === 'pickup') reasons.push(`海关查验尚未结束（状态：查验中），${container.id} 不能提箱离场`);
    else reasons.push(`海关查验尚未结束（状态：查验中），${container.id} 进场后必须先落位查验区 D05 监管，不能按普通进场办结`);
  }
  return reasons;
}

function evidenceGuardReasons(appointment: GateAppointment): string[] {
  const { status } = appointment;
  if (status === 'booked') return ['车辆尚未签到，签到后才能登记封志/称重校验结果'];
  if (status === 'completed') return ['预约已办结，封志/称重证据已归档，不能再修改'];
  if (status === 'cancelled') return ['预约已取消，不能登记校验结果；请先恢复预约并重新签到'];
  return [];
}

function syncContainer(appointment: GateAppointment, status: ContainerStatus, event: string): Container {
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) throw new GateFlowError([`箱号 ${appointment.containerId} 在箱务台账中不存在，无法同步箱务状态`]);
  container.status = status;
  container.lastEvent = `${event} ${new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit' })}`;
  return container;
}

function recordGateAudit(action: string, id: string, details: string) {
  auditEvents.unshift({ id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, actor: '闸口值班员', action, entity: 'appointment', entityId: id, at: new Date().toISOString(), details });
}

function flowResult(stage: GateStage, appointment: GateAppointment, container: Container, previous: ContainerStatus, message: string): GateFlowResult {
  return { stage, appointment, container, previousContainerStatus: previous, containerStatusChanged: previous !== container.status, message };
}

/** 阶段 1：签到。闸口值班员核对箱号与预约类型（提箱/进场）后确认 */
export function gateCheckIn(id: string): GateFlowResult {
  const appointment = findAppointment(id);
  const blockers = statusGuardReasons(appointment, 'check-in');
  if (blockers.length) throw new GateFlowError(blockers);
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) throw new GateFlowError([`箱号 ${appointment.containerId} 在箱务台账中不存在，不能签到`]);
  const previous = container.status;
  appointment.status = 'checked-in';
  appointment.checkedInAt = new Date().toISOString();
  appointment.statusBeforeCheckIn = previous;
  const updated = syncContainer(appointment, 'at-gate', `${gateLaneLabel[appointment.lane]}签到`);
  recordGateAudit('GATE_CHECK_IN', id, `${container.id} ${gateTypeLabel(appointment.type)}签到，箱务 ${previous} -> at-gate`);
  return flowResult('check-in', appointment, updated, previous,
    `${container.id}（${gateTypeLabel(appointment.type)}）已在${gateLaneLabel[appointment.lane]}签到，箱务状态已变为“闸口在场”，请继续完成封志与称重校验`);
}

/** 阶段 2：封志 / 称重证据登记，可反复纠正，但办结后锁定 */
export function gateVerify(id: string, field: 'sealVerified' | 'weightVerified', value: boolean): GateFlowResult {
  const appointment = findAppointment(id);
  const blockers = evidenceGuardReasons(appointment);
  if (blockers.length) throw new GateFlowError(blockers);
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) throw new GateFlowError([`箱号 ${appointment.containerId} 在箱务台账中不存在`]);
  appointment[field] = value;
  const label = field === 'sealVerified' ? '封志' : '称重';
  recordGateAudit('GATE_VERIFY', id, `${container.id} ${label}核验登记为 ${value ? '通过' : '不通过/撤销'}`);
  return flowResult(field === 'sealVerified' ? 'verify-seal' : 'verify-weight', appointment, container, container.status,
    value ? `${container.id} ${label}核验已通过` : `已撤销 ${container.id} 的${label}核验结果，办结前必须重新核验通过`);
}

/** 阶段 3：办结提箱/进场。证据齐全且海关放行才允许，同时同步箱务状态 */
export function gateComplete(id: string): GateFlowResult {
  const appointment = findAppointment(id);
  const blockers = [...statusGuardReasons(appointment, 'complete'), ...(appointment.status === 'checked-in' ? gateCompletionBlockers(appointment) : [])];
  if (blockers.length) throw new GateFlowError(blockers);
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) throw new GateFlowError([`箱号 ${appointment.containerId} 在箱务台账中不存在`]);
  const previous = container.status;
  appointment.status = 'completed';
  appointment.completedAt = new Date().toISOString();
  const next: ContainerStatus = appointment.type === 'pickup' ? 'released' : 'in-yard';
  const updated = syncContainer(appointment, next, appointment.type === 'pickup' ? '提箱离场办结' : `进场落位 ${container.yardSlot}`);
  recordGateAudit('GATE_COMPLETE', id, `${container.id} ${gateTypeLabel(appointment.type)}办结，箱务 ${previous} -> ${next}`);
  const message = appointment.type === 'pickup'
    ? `提箱完成：${container.id} 箱务状态已由“${containerStatusLabel[previous]}”变为“已放行提离”，车辆可离场`
    : `进场完成：${container.id} 箱务状态已由“${containerStatusLabel[previous]}”变为“场内堆存”，堆位 ${container.yardSlot}，已通知场桥作业`;
  return flowResult('complete', appointment, updated, previous, message);
}

/** 取消：已签到车辆同步把箱子退回签到前状态，取消后可恢复重新走流程 */
export function gateCancel(id: string): GateFlowResult {
  const appointment = findAppointment(id);
  const blockers = statusGuardReasons(appointment, 'cancel');
  if (blockers.length) throw new GateFlowError(blockers);
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) throw new GateFlowError([`箱号 ${appointment.containerId} 在箱务台账中不存在`]);
  const previous = container.status;
  appointment.status = 'cancelled';
  appointment.cancelledAt = new Date().toISOString();
  appointment.sealVerified = false;
  appointment.weightVerified = false;
  let updated = container;
  if (previous === 'at-gate') {
    const restore: ContainerStatus = appointment.statusBeforeCheckIn ?? (appointment.type === 'pickup' ? 'in-yard' : 'at-gate');
    updated = syncContainer(appointment, restore, '签到取消，退回签到前状态');
  }
  recordGateAudit('GATE_CANCEL', id, `${container.id} 预约取消${previous !== updated.status ? `，箱务 ${previous} -> ${updated.status}` : ''}`);
  return flowResult('cancel', appointment, updated, previous,
    `预约 ${appointment.id}（${container.id} ${gateTypeLabel(appointment.type)}）已取消${previous !== updated.status ? `，箱务状态退回“${containerStatusLabel[updated.status]}”` : ''}，可恢复后重新安排`);
}

/** 恢复：仅针对已取消预约，重置为待签到并清空证据，保证重新签到/校验/办结链路一致 */
export function gateReopen(id: string): GateFlowResult {
  const appointment = findAppointment(id);
  const blockers = statusGuardReasons(appointment, 'reopen');
  if (blockers.length) throw new GateFlowError(blockers);
  const container = containers.find(c => c.id === appointment.containerId);
  if (!container) throw new GateFlowError([`箱号 ${appointment.containerId} 在箱务台账中不存在`]);
  appointment.status = 'booked';
  appointment.checkedInAt = undefined;
  appointment.completedAt = undefined;
  appointment.cancelledAt = undefined;
  appointment.sealVerified = false;
  appointment.weightVerified = false;
  recordGateAudit('GATE_REOPEN', id, `${container.id} 预约恢复为待签到，证据重置`);
  return flowResult('reopen', appointment, container, container.status,
    `预约 ${appointment.id} 已恢复为待签到，封志/称重证据已重置，请重新完成签到`);
}

export function assignTask(id: string, equipmentId: string) { const task = tasks.find(item => item.id === id); const machine = equipment.find(item => item.id === equipmentId); if (!task || !machine) return undefined; const blockingReasons = [...task.blockingReasons]; if (machine.status === 'maintenance' || machine.status === 'offline') blockingReasons.push(`${machine.name} 当前不可用`); if (task.kind === 'inspect' && machine.kind !== 'reach-stacker') blockingReasons.push('查验作业需要正面吊或专用设备'); task.equipmentId = equipmentId; task.status = blockingReasons.length ? 'blocked' : 'assigned'; task.blockingReasons = blockingReasons; auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action: 'ASSIGN_TASK', entity: 'yard-task', entityId: id, at: new Date().toISOString(), details: `${equipmentId} -> ${task.containerId}` }); return task; }
export function containerDetail(id: string) { const container = containers.find(item => item.id === id); if (!container) return undefined; return { container, voyage: voyages.find(v => v.id === container.voyageId), appointment: appointments.find(a => a.id === container.appointmentId), plan: containerPlan(id), tasks: tasks.filter(t => t.containerId === id) }; }

export type ContainerInput = Omit<Container, 'lastEvent' | 'appointmentId'> & { appointmentId?: string };
export type AppointmentInput = Pick<GateAppointment, 'containerId' | 'truckNo' | 'driver' | 'type' | 'windowStart' | 'windowEnd' | 'lane'>;
export type TaskInput = Pick<YardTask, 'kind' | 'containerId' | 'from' | 'to' | 'priority' | 'scheduledAt' | 'estimatedMinutes'> & { equipmentId?: string };

function recordAudit(action: string, entity: string, entityId: string, details: string) {
  auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action, entity, entityId, at: new Date().toISOString(), details });
}

export function createContainer(input: ContainerInput) {
  const id = input.id.trim().toUpperCase();
  if (!id) throw new Error('箱号不能为空');
  if (containers.some(item => item.id === id)) throw new Error(`箱号 ${id} 已存在`);
  if (!voyages.some(item => item.id === input.voyageId)) throw new Error('关联航次不存在');
  const blockId = parseSlot(input.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (input.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  if (input.reefer && blockId) {
    const block = blocks.find(item => item.id === blockId);
    if (block && block.reeferPlugs <= block.usedPlugs) throw new Error('当前区块没有可用冷藏插座');
  }
  const item: Container = { ...input, id, lastEvent: `人工建档 ${new Date().toLocaleString()}` };
  containers.unshift(item);
  recordAudit('CREATE', 'container', item.id, '新增集装箱台账记录');
  return item;
}

export function updateContainer(id: string, patch: Partial<Omit<Container, 'id' | 'lastEvent'>>) {
  const item = containers.find(container => container.id === id);
  if (!item) return undefined;
  if (patch.voyageId && !voyages.some(voyage => voyage.id === patch.voyageId)) throw new Error('关联航次不存在');
  const next = { ...item, ...patch };
  const blockId = parseSlot(next.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (next.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  Object.assign(item, patch, { lastEvent: `台账更新 ${new Date().toLocaleString()}` });
  recordAudit('UPDATE', 'container', id, '更新集装箱台账字段');
  return item;
}

export function deleteContainer(id: string) {
  const index = containers.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = containers.splice(index, 1);
  const removedAppointments = appointments.filter(appointment => appointment.containerId === id);
  for (const appointment of removedAppointments) appointments.splice(appointments.indexOf(appointment), 1);
  const removedTasks = tasks.filter(task => task.containerId === id);
  for (const task of removedTasks) tasks.splice(tasks.indexOf(task), 1);
  recordAudit('DELETE', 'container', id, `删除箱务记录，并级联清理 ${removedAppointments.length} 条预约、${removedTasks.length} 条未完成任务`);
  return item;
}

export function createGateAppointment(input: AppointmentInput) {
  const container = containers.find(item => item.id === input.containerId);
  if (!container) throw new Error('箱号不存在');
  if (input.type === 'pickup' && container.customs !== 'released') throw new GateFlowError([`海关状态为“${customsLabel[container.customs]}”，${container.id} 不能预约提箱，请先完成海关放行`]);
  if (new Date(input.windowEnd) <= new Date(input.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false };
  appointments.unshift(item);
  container.appointmentId = item.id;
  recordAudit('CREATE', 'appointment', item.id, `为 ${item.containerId} 创建闸口预约`);
  return item;
}

export function editGateAppointment(id: string, patch: Partial<AppointmentInput>) {
  const item = appointments.find(appointment => appointment.id === id);
  if (!item) return undefined;
  const flowKeys = ['status', 'sealVerified', 'weightVerified', 'checkedInAt', 'completedAt', 'cancelledAt'] as const;
  const tampered = flowKeys.filter(key => (patch as Record<string, unknown>)[key] !== undefined);
  if (tampered.length) throw new GateFlowError([`签到、封志/称重、完成、取消等状态只能通过闸口分阶段操作变更，编辑预约不能修改：${tampered.join('、')}`]);
  if (item.status === 'completed') throw new GateFlowError(['预约已办结，箱务状态已归档，不能再编辑时隙；如需调整请新建预约']);
  if (item.status === 'checked-in') throw new GateFlowError(['车辆已签到，正在闸口作业，不能直接编辑；如需改约请先取消当前签到']);
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('箱号不存在');
  if (patch.type && patch.type === 'pickup') {
    const target = containers.find(container => container.id === (patch.containerId ?? item.containerId));
    if (target && target.customs !== 'released') throw new GateFlowError([`海关状态为“${customsLabel[target.customs]}”，${target.id} 不能预约提箱，请先完成海关放行`]);
  }
  if (patch.windowStart && patch.windowEnd && new Date(patch.windowEnd) <= new Date(patch.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const previousContainer = containers.find(container => container.id === item.containerId);
  Object.assign(item, patch);
  const nextContainer = containers.find(container => container.id === item.containerId);
  if (previousContainer && previousContainer.id !== nextContainer?.id && previousContainer.appointmentId === id) previousContainer.appointmentId = undefined;
  if (nextContainer) nextContainer.appointmentId = id;
  recordAudit('UPDATE', 'appointment', id, `更新预约时隙/车辆信息：${JSON.stringify(patch)}`);
  return item;
}

export function deleteGateAppointment(id: string) {
  const index = appointments.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = appointments.splice(index, 1);
  const container = containers.find(entry => entry.id === item.containerId);
  if (container?.appointmentId === id) container.appointmentId = undefined;
  recordAudit('DELETE', 'appointment', id, `取消并删除 ${item.containerId} 的闸口预约`);
  return item;
}

export function createYardTask(input: TaskInput) {
  if (!containers.some(container => container.id === input.containerId)) throw new Error('关联箱号不存在');
  if (input.priority < 1 || input.priority > 100) throw new Error('优先级范围为 1–100');
  if (input.estimatedMinutes <= 0) throw new Error('预计作业时长必须大于 0');
  const item: YardTask = { ...input, id: `TASK-${Date.now()}`, status: input.equipmentId ? 'assigned' : 'queued', blockingReasons: [], scheduledAt: input.scheduledAt };
  tasks.unshift(item);
  recordAudit('CREATE', 'yard-task', item.id, `创建 ${input.kind} 任务，关联 ${input.containerId}`);
  return item;
}

export function updateYardTask(id: string, patch: Partial<TaskInput & Pick<YardTask, 'status' | 'blockingReasons'>>) {
  const item = tasks.find(task => task.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('关联箱号不存在');
  if (patch.priority !== undefined && (patch.priority < 1 || patch.priority > 100)) throw new Error('优先级范围为 1–100');
  Object.assign(item, patch);
  recordAudit('UPDATE', 'yard-task', id, `更新场内作业任务：${JSON.stringify(patch)}`);
  return item;
}

export function deleteYardTask(id: string) {
  const index = tasks.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = tasks.splice(index, 1);
  recordAudit('DELETE', 'yard-task', id, `删除 ${item.containerId} 的场内任务`);
  return item;
}
