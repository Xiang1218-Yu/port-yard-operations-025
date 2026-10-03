import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Dashboard = { activeVoyages: number; berthMoves: number; yardUtilization: number; gateQueue: number; pendingTasks: number; blockedTasks: number; reeferAlerts: number; hazmatHolds: number; lateVessels: number };
type Voyage = { id: string; vessel: string; service: string; eta: string; etd: string; status: string; berth: string; movesPlanned: number; movesDone: number; lateRisk: string };
type Container = { id: string; voyageId: string; size: '20'|'40'|'45'; isoType: string; direction: 'import'|'export'|'transshipment'; status: string; weightT: number; reefer: boolean; temperature?: number; hazmatClass?: string; customs: 'released'|'inspection'|'hold'; priority: string; yardSlot: string; appointmentId?: string; lastEvent: string };
type Block = { id: string; zone: string; capacity: number; occupied: number; reeferPlugs: number; usedPlugs: number; hazmatAllowed: boolean; heat: number; utilization: number; freeSlots: number; pressure: string };
type Conflict = { severity: string; appointmentId: string; reason: string };
type Appointment = { id: string; containerId: string; truckNo: string; driver: string; type: 'pickup'|'dropoff'; windowStart: string; windowEnd: string; lane: 'north'|'south'|'rail'; status: 'booked'|'checked-in'|'completed'|'cancelled'|'exception'; sealVerified: boolean; weightVerified: boolean; checkedInAt?: string; completedAt?: string; cancelledAt?: string; exception?: string };
type GateActionName = 'check-in'|'verify'|'complete'|'cancel'|'reopen';
type GateFlowResult = { stage: GateActionName; appointment: Appointment; container: Container; previousContainerStatus: Container['status']; containerStatusChanged: boolean; message: string };
type VerifyBody = { field: 'sealVerified'|'weightVerified'; value: boolean };
type Task = { id: string; kind: string; containerId: string; from: string; to: string; equipmentId?: string; priority: number; score: number; status: string; blockingReasons: string[]; estimatedMinutes: number; scheduledAt: string };
type Equipment = { id: string; name: string; kind: string; status: string; location: string; battery: number; queue: number; movesPerHour: number };
type Section = 'control'|'containers'|'gate'|'yard'|'tasks';
type Editor = { entity: 'container'|'appointment'|'task'; mode: 'create'|'edit'; id?: string; values: Record<string, string|boolean> };

const api = '/api';
const pct = (value: number) => `${Math.round(value * 100)}%`;
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const toLocalInput = (value?: string) => {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const defaultValues = (entity: Editor['entity']): Record<string, string|boolean> => {
  if (entity === 'container') return { id: '', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'import', status: 'in-yard', weightT: '20', reefer: false, temperature: '4', hazmatClass: '', customs: 'released', priority: 'normal', yardSlot: 'C03-R01-T1' };
  if (entity === 'appointment') return { containerId: '', truckNo: '', driver: '', type: 'pickup', windowStart: toLocalInput(), windowEnd: toLocalInput(new Date(Date.now() + 60 * 60000).toISOString()), lane: 'north' };
  return { kind: 'receive', containerId: '', from: '闸口', to: 'C03-R01-T1', equipmentId: '', priority: '50', scheduledAt: toLocalInput(), estimatedMinutes: '20', status: 'queued' };
};

const gateTypeText = (type: Appointment['type']) => type === 'pickup' ? '提箱' : '进场';
const gateLaneText = (lane: Appointment['lane']) => lane === 'north' ? '北闸口' : lane === 'south' ? '南闸口' : '铁路闸口';
const appointmentStatusText: Record<Appointment['status'], string> = { booked: '待签到', 'checked-in': '已签到', completed: '已完成', cancelled: '已取消', exception: '异常' };
const customsText: Record<Container['customs'], string> = { released: '已放行', inspection: '查验中', hold: '扣留' };
const containerStatusText: Record<Container['status'], string> = { 'in-transit': '运输中', 'at-gate': '闸口在场', 'in-yard': '场内堆存', 'on-quay': '码头前沿', released: '已放行提离', hold: '挂起' };

/** 办结前置条件（前端预检，与服务端 gateCompletionBlockers 保持一致，用于在点“完成”前就逐条说明） */
function completionBlockers(appointment: Appointment, container?: Container): string[] {
  if (!container) return [`箱号 ${appointment.containerId} 在箱务台账中不存在，无法核对海关与证据条件`];
  const reasons: string[] = [];
  if (!appointment.sealVerified) reasons.push('封志未核验通过：闸口封志证据缺失，不能完成' + gateTypeText(appointment.type));
  if (!appointment.weightVerified) reasons.push('称重未核验通过：地磅重量证据缺失，不能完成' + gateTypeText(appointment.type));
  if (container.customs === 'hold') reasons.push(`海关状态为“扣留”，${container.id} 被海关布控，请联系海关解除扣留后再${gateTypeText(appointment.type)}`);
  if (container.customs === 'inspection') {
    if (appointment.type === 'pickup') reasons.push(`海关查验尚未结束（状态：查验中），${container.id} 不能提箱离场`);
    else reasons.push(`海关查验尚未结束（状态：查验中），${container.id} 进场后必须先落位查验区 D05 监管，不能按普通进场办结`);
  }
  return reasons;
}

class ApiError extends Error {
  reasons?: string[];
  constructor(message: string, reasons?: string[]) { super(message); this.reasons = reasons; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || `请求失败 (${response.status})`, Array.isArray(body.reasons) ? body.reasons : undefined);
  return body as T;
}

function GateRow(props: {
  appointment: Appointment;
  container?: Container;
  busy: boolean;
  errors: string[];
  confirming: boolean;
  onConfirmingChange: (open: boolean) => void;
  onAction: (action: GateActionName, body?: VerifyBody) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { appointment: a, container, busy, errors, confirming, onConfirmingChange, onAction, onEdit, onDelete } = props;
  const blockers = a.status === 'checked-in' ? completionBlockers(a, container) : [];
  const ready = blockers.length === 0;
  const targetStatus = a.type === 'pickup' ? 'released' : 'in-yard';
  const verifyButton = (field: VerifyBody['field'], label: string, passed: boolean) => (
    <button
      className={passed ? 'verify-toggle passed' : 'verify-toggle'}
      disabled={busy}
      title={passed ? `撤销${label}通过记录` : `登记${label}核验通过`}
      onClick={() => onAction('verify', { field, value: !passed })}
    >{busy ? '处理中…' : passed ? `${label} ✓ 已通过（点击撤销）` : `${label} 未通过（点击登记）`}</button>
  );
  return (
    <div className={`tr gate-row status-${a.status}`}>
      <span><b>{a.id}</b><small>{gateTypeText(a.type)} · {appointmentStatusText[a.status]}</small></span>
      <span><b>{a.containerId}</b><small>{a.truckNo} · {a.driver}</small>{a.exception && <small className="row-warn">⚠ {a.exception}</small>}</span>
      <span>{time(a.windowStart)}—{time(a.windowEnd)}
        {a.checkedInAt && <small>签到 {time(a.checkedInAt)}</small>}
        {a.completedAt && <small>完成 {time(a.completedAt)}</small>}
        {a.cancelledAt && <small>取消 {time(a.cancelledAt)}</small>}
      </span>
      <span>{gateLaneText(a.lane)}</span>
      <span>
        <span className={`pill ${a.status}`}>{appointmentStatusText[a.status]}</span>
        <span className="evidence-chips">
          <i className={a.sealVerified ? 'ok' : 'missing'}>封志{a.sealVerified ? '✓' : '—'}</i>
          <i className={a.weightVerified ? 'ok' : 'missing'}>称重{a.weightVerified ? '✓' : '—'}</i>
        </span>
      </span>
      <span className="row-actions">
        {(a.status === 'booked' || a.status === 'exception') && <>
          <button className="stage-primary" disabled={busy} onClick={() => onConfirmingChange(!confirming)}>{busy ? '处理中…' : confirming ? '收起' : '签到'}</button>
          <button disabled={busy} onClick={() => { if (window.confirm(`确认取消预约 ${a.id}？车辆尚未到场，取消后可恢复或删除。`)) onAction('cancel'); }}>取消</button>
          <button disabled={busy} onClick={onEdit}>编辑</button>
          <button className="danger-action" disabled={busy} onClick={onDelete}>删除</button>
        </>}
        {a.status === 'checked-in' && <>
          <button className="stage-primary" disabled={busy || !ready} onClick={() => onAction('complete')}>{busy ? '处理中…' : `完成${gateTypeText(a.type)}`}</button>
          <button disabled={busy} onClick={() => { if (window.confirm(`确认取消 ${a.id} 的签到？封志/称重记录将清空，箱务状态退回签到前，需要重新签到。`)) onAction('cancel'); }}>取消签到</button>
        </>}
        {a.status === 'cancelled' && <>
          <button className="stage-primary" disabled={busy} onClick={() => onAction('reopen')}>{busy ? '处理中…' : '恢复预约'}</button>
          <button className="danger-action" disabled={busy} onClick={onDelete}>删除</button>
        </>}
        {a.status === 'completed' && <button className="danger-action" disabled={busy} onClick={onDelete}>删除记录</button>}
      </span>
      {(confirming || a.status === 'checked-in' || errors.length > 0) && (
        <div className="gate-stage">
          {confirming && (a.status === 'booked' || a.status === 'exception') && (
            <div className="stage-card checkin-card">
              <div className="stage-title"><span className="step">阶段 1 / 签到</span><b>{a.containerId}</b><span className={`type-tag ${a.type}`}>{gateTypeText(a.type)}</span></div>
              <div className="stage-facts">
                <span>车牌 / 司机：<b>{a.truckNo} · {a.driver}</b></span>
                <span>车道 / 时隙：<b>{gateLaneText(a.lane)} · {time(a.windowStart)}–{time(a.windowEnd)}</b></span>
                <span>海关状态：<b className={container && container.customs !== 'released' ? 'text-warn' : 'text-ok'}>{container ? customsText[container.customs] : '箱号缺失'}</b></span>
                <span>箱务现状：<b>{container ? containerStatusText[container.status] : '箱号缺失'}</b></span>
              </div>
              {container && container.customs !== 'released' && a.type === 'dropoff' && <p className="stage-hint">提示：该箱海关{customsText[container.customs]}，签到后箱务变为“闸口在场”，但办结时会要求落位查验区监管。</p>}
              <div className="stage-actions"><button className="stage-primary" disabled={busy || !container} onClick={() => onAction('check-in')}>{busy ? '签到中…' : `确认${gateTypeText(a.type)}签到`}</button><button disabled={busy} onClick={() => onConfirmingChange(false)}>收起</button></div>
            </div>
          )}
          {a.status === 'checked-in' && (
            <div className="stage-card">
              <div className="stage-title"><span className="step">阶段 2–3 / 闸口校验与办结</span><b>{a.containerId}</b><span className={`type-tag ${a.type}`}>{gateTypeText(a.type)}</span></div>
              <div className="verify-row">
                {verifyButton('sealVerified', '封志', a.sealVerified)}
                {verifyButton('weightVerified', '称重', a.weightVerified)}
                <span className="status-flow">箱务：<b>{container ? containerStatusText[container.status] : '—'}</b> → <b className="text-ok">{containerStatusText[targetStatus]}{a.type === 'dropoff' && container ? `（${container.yardSlot}）` : ''}</b></span>
              </div>
              <ul className="gate-checklist">
                <li className={a.sealVerified ? 'ok' : 'missing'}>{a.sealVerified ? '✓' : '✕'} 封志证据已核验{!a.sealVerified && '（办结必填）'}</li>
                <li className={a.weightVerified ? 'ok' : 'missing'}>{a.weightVerified ? '✓' : '✕'} 称重证据已核验{!a.weightVerified && '（办结必填）'}</li>
                <li className={!container || container.customs === 'released' ? 'ok' : 'missing'}>{!container || container.customs === 'released' ? '✓' : '✕'} 海关状态允许{gateTypeText(a.type)}（当前：{container ? customsText[container.customs] : '箱号缺失'}）</li>
              </ul>
              {!ready && <p className="stage-hint warn">以下条件未满足，{gateTypeText(a.type)}按钮暂不可用；如与海关/OCR/地磅系统状态不符，请联系对应岗位更新证据后重试：</p>}
              {blockers.map(reason => <p key={reason} className="stage-reason">• {reason}</p>)}
              <div className="stage-actions">
                <button className="stage-primary" disabled={busy || !ready} onClick={() => onAction('complete')}>{busy ? '办结中…' : `完成${gateTypeText(a.type)}并同步箱务状态`}</button>
              </div>
            </div>
          )}
          {errors.length > 0 && <div className="gate-errors"><b>操作未完成：</b><ul>{errors.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [tab, setTab] = useState<Section>('control');
  const [selectedVoyage, setSelectedVoyage] = useState('VOY-AX7');
  const [editor, setEditor] = useState<Editor>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** 当前正在执行的闸口动作（按 预约ID+动作 维度），防止重复点击；行内错误与确认面板按预约ID管理 */
  const [gateBusy, setGateBusy] = useState<Record<string, boolean>>({});
  const [gateRowError, setGateRowError] = useState<Record<string, string[]>>({});
  const [confirmingId, setConfirmingId] = useState('');
  const gateInFlight = useRef<Set<string>>(new Set([]));

  const load = useCallback(async () => {
    const [d, v, ctn, b, cf, a, t, e] = await Promise.all([
      request<Dashboard>('/dashboard'), request<Voyage[]>('/voyages'), request<Container[]>('/containers'),
      request<Block[]>('/yard/heatmap'), request<Conflict[]>('/gate/conflicts'), request<Appointment[]>('/gate/appointments'),
      request<Task[]>('/tasks'), request<Equipment[]>('/equipment')
    ]);
    setDashboard(d); setVoyages(v); setContainers(ctn); setBlocks(b); setConflicts(cf); setAppointments(a); setTasks(t); setEquipment(e);
  }, []);
  useEffect(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : '无法连接服务端')); }, [load]);

  const mutate = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setError('');
    try {
      await request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      await load(); setEditor(undefined); setMessage('操作已保存，作业台数据已刷新');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const openCreate = (entity: Editor['entity']) => { setError(''); setEditor({ entity, mode: 'create', values: defaultValues(entity) }); };
  const openEdit = (entity: Editor['entity'], id: string, values: Record<string, string|boolean>) => { setError(''); setEditor({ entity, mode: 'edit', id, values: { ...values } }); };
  const updateField = (key: string, value: string|boolean) => setEditor(current => current ? { ...current, values: { ...current.values, [key]: value } } : current);
  const saveEditor = async (event: FormEvent) => {
    event.preventDefault(); if (!editor) return;
    const { entity, mode, id, values } = editor;
    const payload: Record<string, unknown> = entity === 'container' ? {
      ...(mode === 'create' ? { id: values.id } : {}), voyageId: values.voyageId, size: values.size, isoType: values.isoType,
      direction: values.direction, status: values.status, weightT: Number(values.weightT), reefer: Boolean(values.reefer),
      ...(values.reefer ? { temperature: Number(values.temperature) } : {}), ...(values.hazmatClass ? { hazmatClass: values.hazmatClass } : {}),
      customs: values.customs, priority: values.priority, yardSlot: values.yardSlot
    } : entity === 'appointment' ? {
      containerId: values.containerId, truckNo: values.truckNo, driver: values.driver, type: values.type,
      windowStart: new Date(String(values.windowStart)).toISOString(), windowEnd: new Date(String(values.windowEnd)).toISOString(), lane: values.lane
    } : {
      kind: values.kind, containerId: values.containerId, from: values.from, to: values.to, priority: Number(values.priority),
      scheduledAt: new Date(String(values.scheduledAt)).toISOString(), estimatedMinutes: Number(values.estimatedMinutes),
      ...(values.equipmentId ? { equipmentId: values.equipmentId } : {}), ...(mode === 'edit' ? { status: values.status } : {})
    };
    await mutate(entity === 'container' ? `/containers${mode === 'edit' ? `/${id}` : ''}` : entity === 'appointment' ? `/gate/appointments${mode === 'edit' ? `/${id}` : ''}` : `/tasks${mode === 'edit' ? `/${id}` : ''}`, mode === 'create' ? 'POST' : 'PATCH', payload);
  };
  const remove = async (entity: Editor['entity'], id: string) => {
    if (!window.confirm(`确认删除 ${id}？相关数据的联动处理会写入审计记录。`)) return;
    const path = entity === 'container' ? `/containers/${id}` : entity === 'appointment' ? `/gate/appointments/${id}` : `/tasks/${id}`;
    await mutate(path, 'DELETE');
  };
  /**
   * 闸口分阶段操作统一入口：签到 / 封志·称重登记 / 完成 / 取消 / 恢复。
   * - 同一预约同一动作在途时直接忽略后续点击（重复点击保护，含按钮禁用双保险）；
   * - 失败时把服务端逐条原因（海关、封志、称重等）显示在该预约行内，而不是通用弹窗；
   * - 成功后重新拉取全部列表（箱务状态、预约状态、冲突、KPI 保持一致），并展示箱务状态变化。
   */
  const runGateAction = useCallback(async (id: string, action: GateActionName, body?: VerifyBody) => {
    const inFlightKey = `${id}:${action}:${body?.field ?? ''}`;
    if (gateInFlight.current.has(inFlightKey)) return;
    gateInFlight.current.add(inFlightKey);
    setGateBusy(current => ({ ...current, [id]: true }));
    setGateRowError(current => { if (!current[id]) return current; const next = { ...current }; delete next[id]; return next; });
    try {
      const result = await request<GateFlowResult>(
        `/gate/appointments/${id}/${action}`,
        { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }
      );
      await load();
      setConfirmingId(current => (current === id && result.appointment.status !== 'checked-in' ? '' : current));
      setMessage(result.containerStatusChanged
        ? `${result.message}（箱务：${containerStatusText[result.previousContainerStatus]} → ${containerStatusText[result.container.status]}）`
        : result.message);
      setError('');
    } catch (reason) {
      const reasons = reason instanceof ApiError && reason.reasons?.length
        ? reason.reasons
        : [reason instanceof Error ? reason.message : '闸口操作失败，请稍后重试'];
      setGateRowError(current => ({ ...current, [id]: reasons }));
    } finally {
      gateInFlight.current.delete(inFlightKey);
      setGateBusy(current => ({ ...current, [id]: false }));
    }
  }, [load]);
  const assign = async (id: string, equipmentId: string) => equipmentId ? mutate(`/tasks/${id}/assign`, 'PATCH', { equipmentId }) : mutate(`/tasks/${id}`, 'PATCH', { equipmentId: '', status: 'queued' });
  const selected = voyages.find(voyage => voyage.id === selectedVoyage);
  const remaining = selected ? selected.movesPlanned - selected.movesDone : 0;
  const maxHeat = useMemo(() => Math.max(...blocks.map(block => block.heat), 1), [blocks]);

  if (!dashboard && error) return <main className="connection-error"><div className="eyebrow">API CONNECTION ERROR</div><h1>无法连接港口作业服务</h1><p>{error}</p><p>请从项目根目录运行 <code>npm run dev</code>，确认前端 5178 和 API 4107 均已启动。</p><button onClick={() => { setError(''); void load().catch(reason => setError(reason instanceof Error ? reason.message : '无法连接服务端')); }}>重新连接</button></main>;
  if (!dashboard) return <div className="loading">正在连接码头实时作业中台…</div>;

  return <main>
    <header><div><div className="eyebrow">PORT OPS / YARD & GATE CONTROL</div><h1>HarborGrid <span>港口集装箱堆场协同与闸口调度</span></h1><p>把船期、箱务、堆场容量、危险品/冷藏约束、闸口预约与场内设备任务放在同一条作业链路上。</p></div><div className="header-right"><span className="live"><i/> TOS LINKED</span><span className="clock">LIVE · {new Date().toLocaleTimeString()}</span></div></header>
    {message && <div className="toast" onClick={() => setMessage('')}>{message} ×</div>}{error && <div className="form-error page-error">{error}<button onClick={() => setError('')}>关闭</button></div>}
    <section className="kpis"><div><small>ACTIVE VESSELS</small><b>{dashboard.activeVoyages}<em> 艘</em></b><span>{dashboard.lateVessels} 艘存在延误风险</span></div><div><small>YARD UTILIZATION</small><b>{pct(dashboard.yardUtilization)}</b><span>可用堆位 / 危险品隔离纳管</span></div><div><small>GATE QUEUE</small><b>{dashboard.gateQueue}<em> 车</em></b><span>预约、已进场与车道排队</span></div><div><small>EXCEPTIONS</small><b>{dashboard.blockedTasks + dashboard.reeferAlerts + dashboard.hazmatHolds}<em> 项</em></b><span>{dashboard.blockedTasks} 作业阻塞 · {dashboard.reeferAlerts} 冷藏告警</span></div></section>
    <nav className="tabs"><button className={tab==='control'?'active':''} onClick={() => setTab('control')}>作业驾驶舱</button><button className={tab==='containers'?'active':''} onClick={() => setTab('containers')}>箱务台账 / CRUD</button><button className={tab==='gate'?'active':''} onClick={() => setTab('gate')}>闸口预约</button><button className={tab==='yard'?'active':''} onClick={() => setTab('yard')}>堆场热区</button><button className={tab==='tasks'?'active':''} onClick={() => setTab('tasks')}>设备任务</button><span>最后同步 {new Date().toLocaleTimeString()}</span></nav>
    {tab === 'control' && <div className="layout"><section className="panel vessel-panel"><div className="panel-head"><div><div className="eyebrow">VESSEL WINDOW / 船期窗口</div><h2>泊位作业进度</h2></div><span className="muted">剩余作业动态计算</span></div>{voyages.map(voyage => <button key={voyage.id} className={`vessel ${selectedVoyage===voyage.id?'selected':''}`} onClick={() => setSelectedVoyage(voyage.id)}><span className={`vessel-dot ${voyage.status}`}/><span className="vessel-main"><b>{voyage.vessel}</b><small>{voyage.id} · {voyage.service} · {voyage.berth}</small><i><em style={{ width: `${Math.min(100, voyage.movesDone / voyage.movesPlanned * 100)}%` }}/></i></span><span className="vessel-move"><b>{voyage.movesDone.toLocaleString()}</b><small>/ {voyage.movesPlanned.toLocaleString()} moves</small></span><strong className={voyage.lateRisk}>{voyage.lateRisk==='high'?'HIGH':voyage.lateRisk==='medium'?'WATCH':'ON TIME'}</strong></button>)}</section><section className="panel focus-panel"><div className="panel-head"><div><div className="eyebrow">SELECTED VOYAGE / {selected?.id}</div><h2>{selected?.vessel}</h2></div><span className={`badge ${selected?.lateRisk}`}>{selected?.status}</span></div><div className="voyage-stats"><div><small>ETA</small><b>{selected&&time(selected.eta)}</b><span>预计靠泊</span></div><div><small>ETD</small><b>{selected&&time(selected.etd)}</b><span>计划离港</span></div><div><small>REMAINING</small><b>{remaining}</b><span>剩余翻箱</span></div></div><div className="berth-map"><div className="water"><span>岸线 / BERTH</span><i className="ship" style={{ left: `${selected?.berth==='B07'?50:24}%` }}>{selected?.vessel}</i><b>B01</b><b>B04</b><b>B07</b><b>B10</b></div></div><div className="callout"><strong>调度策略</strong><span>已把 {dashboard.blockedTasks} 个阻塞任务、{dashboard.gateQueue} 车闸口压力纳入当前窗口；优先保护冷藏与危险品安全约束。</span></div></section><section className="panel wide"><div className="panel-head"><h3>异常与联动信号</h3><span>{conflicts.length} gate conflicts detected</span></div><div className="signal-grid"><div><strong className="critical">{dashboard.blockedTasks}</strong><span>设备/约束阻塞</span><small>最高优先级：海关查验任务</small></div><div><strong className="warning">{conflicts.length}</strong><span>闸口预约冲突</span><small>同车重叠窗口需人工重排</small></div><div><strong className="warning">{dashboard.reeferAlerts}</strong><span>冷藏与温控风险</span><small>查验区电源余量接近阈值</small></div><div><strong className="ok">{equipment.filter(item => item.status==='available').length}</strong><span>可调度设备</span><small>场桥 / 正面吊 / 集卡</small></div></div></section></div>}
    {tab === 'containers' && <section className="panel wide"><div className="panel-head"><div><div className="eyebrow">CONTAINER REGISTER / CRUD</div><h2>箱务台账</h2><span className="muted">新增、查询、编辑、删除；危险品与冷藏箱受堆场约束校验</span></div><button className="primary-action" onClick={() => openCreate('container')}>＋ 新增箱务</button></div><div className="table container-table"><div className="tr th"><span>箱号 / 航次</span><span>尺寸 / 流向</span><span>箱况 / 海关</span><span>堆位</span><span>重量 / 属性</span><span>操作</span></div>{containers.map(container => <div className="tr" key={container.id}><span><b>{container.id}</b><small>{container.voyageId} · {container.lastEvent}</small></span><span>{container.size}ft · {container.direction}<small>{container.isoType}</small></span><span><b>{container.status}</b><small>海关：{container.customs}</small></span><span>{container.yardSlot}</span><span>{container.weightT}t<small>{container.reefer?`冷藏 ${container.temperature}°C`:container.hazmatClass?`危险品 ${container.hazmatClass} 类`:'普通箱'}</small></span><span className="row-actions"><button onClick={() => openEdit('container', container.id, { ...container, weightT: String(container.weightT), temperature: String(container.temperature ?? 4), hazmatClass: container.hazmatClass ?? '' })}>编辑</button><button className="danger-action" onClick={() => void remove('container', container.id)}>删除</button></span></div>)}</div></section>}
    {tab === 'gate' && <section className="panel wide"><div className="panel-head"><div><div className="eyebrow">GATE APPOINTMENT / SLOT CONTROL</div><h2>闸口预约与车道状态</h2><span className="muted">按真实作业顺序操作：① 签到（核对箱号与提箱/进场）→ ② 封志·称重校验 → ③ 完成并同步箱务状态；取消后可恢复重走</span></div><button className="primary-action" onClick={() => openCreate('appointment')}>＋ 新增预约</button></div>{conflicts.map(conflict => <div className="conflict" key={`${conflict.appointmentId}-${conflict.reason}`}><strong>{conflict.severity}</strong><b>{conflict.appointmentId}</b><span>{conflict.reason}</span></div>)}<div className="table gate-table"><div className="tr th"><span>预约</span><span>箱号 / 车辆</span><span>窗口</span><span>车道</span><span>状态 / 证据</span><span>分阶段操作</span></div>{appointments.map(appointment => <GateRow key={appointment.id} appointment={appointment} container={containers.find(c => c.id === appointment.containerId)} busy={Boolean(gateBusy[appointment.id])} errors={gateRowError[appointment.id] ?? []} confirming={confirmingId === appointment.id} onConfirmingChange={(open) => { setGateRowError(current => { if (!current[appointment.id]) return current; const next = { ...current }; delete next[appointment.id]; return next; }); setConfirmingId(open ? appointment.id : ''); }} onAction={(action, body) => void runGateAction(appointment.id, action, body)} onEdit={() => openEdit('appointment', appointment.id, { containerId: appointment.containerId, truckNo: appointment.truckNo, driver: appointment.driver, type: appointment.type, windowStart: toLocalInput(appointment.windowStart), windowEnd: toLocalInput(appointment.windowEnd), lane: appointment.lane })} onDelete={() => void remove('appointment', appointment.id)} />)}</div></section>}
    {tab === 'yard' && <section className="panel wide"><div className="panel-head"><div><div className="eyebrow">YARD HEATMAP / STACK DENSITY</div><h2>堆场容量与安全约束</h2></div><span className="muted">实时区块压力</span></div><div className="yard-grid">{blocks.map(block => <div className={`block ${block.pressure}`} key={block.id}><div className="block-top"><b>{block.id}</b><strong>{pct(block.utilization)}</strong></div><span>{block.zone}</span><div className="heat"><i style={{ width: `${block.heat / maxHeat * 100}%` }}/></div><div className="block-stats"><span>空位 {block.freeSlots}</span><span>冷插 {block.usedPlugs}/{block.reeferPlugs}</span><span>{block.hazmatAllowed?'危险品可入':'普通区'}</span></div></div>)}</div><div className="yard-note"><span>堆位推荐会同时考虑容量、热区、危险品隔离、冷藏插座和设备可达性。</span><b>A01 → C03 重排建议可释放 21 个低热度堆位</b></div></section>}
    {tab === 'tasks' && <div className="layout"><section className="panel wide"><div className="panel-head"><div><div className="eyebrow">TASK DISPATCH / EQUIPMENT POOL</div><h2>场内任务优先级与设备指派</h2><span className="muted">支持新增、编辑、删除和设备指派</span></div><button className="primary-action" onClick={() => openCreate('task')}>＋ 新建任务</button></div><div className="table task-table"><div className="tr th"><span>任务</span><span>箱号</span><span>路径</span><span>优先级</span><span>状态</span><span>设备 / 操作</span></div>{tasks.map(task => <div className="tr" key={task.id}><span><b>{task.id}</b><small>{task.kind} · {task.estimatedMinutes}min</small></span><span>{task.containerId}</span><span>{task.from} → {task.to}</span><span className={task.score>95?'critical':''}>{task.score}</span><span><span className={`pill ${task.status}`}>{task.status}</span>{task.blockingReasons.length>0&&<small className="blocked-text">{task.blockingReasons[0]}</small>}</span><span className="task-actions"><select value={task.equipmentId??''} onChange={event => void assign(task.id, event.target.value)}><option value="">未指派</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => openEdit('task', task.id, { kind: task.kind, containerId: task.containerId, from: task.from, to: task.to, equipmentId: task.equipmentId ?? '', priority: String(task.priority), estimatedMinutes: String(task.estimatedMinutes), scheduledAt: toLocalInput(task.scheduledAt), status: task.status })}>编辑</button><button className="danger-action" onClick={() => void remove('task', task.id)}>删除</button></span></div>)}</div></section><section className="panel"><div className="panel-head"><h3>设备池</h3><span>{equipment.length} assets</span></div>{equipment.map(item => <div className="equipment" key={item.id}><i className={`equip-dot ${item.status}`}/><div><b>{item.name}</b><small>{item.location} · 队列 {item.queue}</small></div><strong>{item.battery}%</strong></div>)}</section></div>}
    <footer>HarborGrid · 内存种子数据 + REST API · 箱务台账、闸口预约、场内任务提供完整增删改查操作</footer>
    {editor && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(undefined); }}><form className="editor-modal" onSubmit={saveEditor}><div className="modal-head"><div><div className="eyebrow">{editor.mode.toUpperCase()} / {editor.entity.toUpperCase()}</div><h2>{editor.mode==='create'?'创建':'编辑'}{editor.entity==='container'?'箱务记录':editor.entity==='appointment'?'闸口预约':'作业任务'}</h2></div><button type="button" className="icon-button" onClick={() => setEditor(undefined)}>×</button></div>
      {editor.entity === 'container' && <div className="form-grid">
        <label>集装箱号<input required disabled={editor.mode==='edit'} value={String(editor.values.id)} onChange={event => updateField('id', event.target.value.toUpperCase())}/></label>
        <label>关联航次<select value={String(editor.values.voyageId)} onChange={event => updateField('voyageId', event.target.value)}>{voyages.filter(voyage => voyage.status!=='departed').map(voyage => <option key={voyage.id} value={voyage.id}>{voyage.id} · {voyage.vessel}</option>)}</select></label>
        <label>尺寸<select value={String(editor.values.size)} onChange={event => updateField('size', event.target.value)}><option value="20">20 ft</option><option value="40">40 ft</option><option value="45">45 ft</option></select></label>
        <label>ISO 箱型<input required value={String(editor.values.isoType)} onChange={event => updateField('isoType', event.target.value)}/></label>
        <label>作业流向<select value={String(editor.values.direction)} onChange={event => updateField('direction', event.target.value)}><option value="import">进口</option><option value="export">出口</option><option value="transshipment">中转</option></select></label>
        <label>箱状态<select value={String(editor.values.status)} onChange={event => updateField('status', event.target.value)}>{['in-transit','at-gate','in-yard','on-quay','released','hold'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>重量 (吨)<input type="number" min="0.1" step="0.1" required value={String(editor.values.weightT)} onChange={event => updateField('weightT', event.target.value)}/></label>
        <label>海关状态<select value={String(editor.values.customs)} onChange={event => updateField('customs', event.target.value)}><option value="released">已放行</option><option value="inspection">查验中</option><option value="hold">扣留</option></select></label>
        <label>优先级<select value={String(editor.values.priority)} onChange={event => updateField('priority', event.target.value)}><option value="normal">普通</option><option value="hot">急箱</option><option value="reefer">冷藏</option><option value="hazmat">危险品</option></select></label>
        <label>堆位<input required placeholder="例如 B07-R03-T2" value={String(editor.values.yardSlot)} onChange={event => updateField('yardSlot', event.target.value.toUpperCase())}/></label>
        <label>危险品类别<input placeholder="非危险品留空" value={String(editor.values.hazmatClass)} onChange={event => updateField('hazmatClass', event.target.value)}/></label>
        <label className="check-label"><input type="checkbox" checked={Boolean(editor.values.reefer)} onChange={event => updateField('reefer', event.target.checked)}/>冷藏箱</label>
        {Boolean(editor.values.reefer) && <label>目标温度 (°C)<input type="number" step="0.1" value={String(editor.values.temperature)} onChange={event => updateField('temperature', event.target.value)}/></label>}
      </div>}
      {editor.entity === 'appointment' && <div className="form-grid">
        <label>集装箱<select required value={String(editor.values.containerId)} onChange={event => updateField('containerId', event.target.value)}><option value="">选择箱号</option>{containers.map(container => <option key={container.id} value={container.id}>{container.id} · {container.status}</option>)}</select></label>
        <label>预约类型<select value={String(editor.values.type)} onChange={event => updateField('type', event.target.value)}><option value="pickup">提箱</option><option value="dropoff">进场</option></select></label>
        <label>车牌号<input required value={String(editor.values.truckNo)} onChange={event => updateField('truckNo', event.target.value)}/></label><label>司机<input required value={String(editor.values.driver)} onChange={event => updateField('driver', event.target.value)}/></label>
        <label>窗口开始<input type="datetime-local" required value={String(editor.values.windowStart)} onChange={event => updateField('windowStart', event.target.value)}/></label><label>窗口结束<input type="datetime-local" required value={String(editor.values.windowEnd)} onChange={event => updateField('windowEnd', event.target.value)}/></label>
        <label>闸口车道<select value={String(editor.values.lane)} onChange={event => updateField('lane', event.target.value)}><option value="north">北闸口</option><option value="south">南闸口</option><option value="rail">铁路闸口</option></select></label>
      </div>}
      {editor.entity === 'task' && <div className="form-grid">
        <label>任务类型<select value={String(editor.values.kind)} onChange={event => updateField('kind', event.target.value)}>{['receive','deliver','rehandle','load','discharge','inspect'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>关联箱号<select required value={String(editor.values.containerId)} onChange={event => updateField('containerId', event.target.value)}><option value="">选择箱号</option>{containers.map(container => <option key={container.id} value={container.id}>{container.id}</option>)}</select></label>
        <label>起点<input required value={String(editor.values.from)} onChange={event => updateField('from', event.target.value)}/></label><label>终点<input required value={String(editor.values.to)} onChange={event => updateField('to', event.target.value)}/></label>
        <label>优先级 (1–100)<input type="number" min="1" max="100" required value={String(editor.values.priority)} onChange={event => updateField('priority', event.target.value)}/></label><label>预计时长 (分钟)<input type="number" min="1" required value={String(editor.values.estimatedMinutes)} onChange={event => updateField('estimatedMinutes', event.target.value)}/></label>
        <label>计划时间<input type="datetime-local" required value={String(editor.values.scheduledAt)} onChange={event => updateField('scheduledAt', event.target.value)}/></label><label>指派设备<select value={String(editor.values.equipmentId)} onChange={event => updateField('equipmentId', event.target.value)}><option value="">暂不指派</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
        {editor.mode==='edit' && <label>任务状态<select value={String(editor.values.status)} onChange={event => updateField('status', event.target.value)}>{['queued','assigned','executing','blocked','done'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      </div>}
      {error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" onClick={() => setEditor(undefined)}>取消</button><button className="primary-action" disabled={busy}>{busy?'保存中…':'保存'}</button></div>
    </form></div>}
  </main>;
}
