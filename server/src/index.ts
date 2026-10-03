import express from 'express';
import { appointments, assignTask, blocks, containerDetail, containers, createContainer, createGateAppointment, createYardTask, dashboard, deleteContainer, deleteGateAppointment, deleteYardTask, editGateAppointment, equipment, gateCancel, gateCheckIn, gateComplete, gateReopen, gateVerify, GateFlowError, gateConflicts, prioritizeTasks, tasks, updateContainer, updateYardTask, voyages, yardHeatmap } from './domain.js';
const app = express(); app.use(express.json());
/** 闸口分阶段动作失败：返回 422 与逐条原因，前端展示为可操作的整改提示而非通用错误 */
function failure(res: express.Response, error: unknown, fallback: string, status = 409) {
  if (error instanceof GateFlowError) return res.status(422).json({ message: error.message, reasons: error.reasons });
  return res.status(status).json({ message: error instanceof Error ? error.message : fallback });
}
app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/voyages', (_req, res) => res.json(voyages));
app.get('/api/containers', (req, res) => res.json(req.query.status ? containers.filter(c => c.status === req.query.status) : containers));
app.post('/api/containers', (req, res) => { try { res.status(201).json(createContainer(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建箱务记录失败' }); } });
app.patch('/api/containers/:id', (req, res) => { try { const result = updateContainer(req.params.id, req.body); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新箱务记录失败' }); } });
app.delete('/api/containers/:id', (req, res) => { const result = deleteContainer(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/containers/:id', (req, res) => { const result = containerDetail(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); });
app.get('/api/yard/heatmap', (_req, res) => res.json(yardHeatmap()));
app.get('/api/yard/blocks', (_req, res) => res.json(blocks));
app.get('/api/gate/appointments', (_req, res) => res.json(appointments));
app.get('/api/gate/conflicts', (_req, res) => res.json(gateConflicts()));
app.post('/api/gate/appointments', (req, res) => { try { res.status(201).json(createGateAppointment(req.body)); } catch (error) { failure(res, error, '预约失败'); } });
app.patch('/api/gate/appointments/:id', (req, res) => { try { const result = editGateAppointment(req.params.id, req.body); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json(result); } catch (error) { failure(res, error, '更新预约失败'); } });
/** 分阶段闸口作业：签到 → 封志/称重校验 → 完成；以及取消/恢复。状态机与放行条件均在领域层校验 */
app.post('/api/gate/appointments/:id/check-in', (_req, res) => { try { res.json(gateCheckIn(_req.params.id)); } catch (error) { failure(res, error, '签到失败'); } });
app.post('/api/gate/appointments/:id/verify', (req, res) => {
  const field = req.body.field === 'sealVerified' || req.body.field === 'weightVerified' ? req.body.field : undefined;
  if (!field) return res.status(400).json({ message: '校验字段无效，必须为 sealVerified 或 weightVerified' });
  try { res.json(gateVerify(req.params.id, field, Boolean(req.body.value))); } catch (error) { failure(res, error, '校验登记失败'); }
});
app.post('/api/gate/appointments/:id/complete', (_req, res) => { try { res.json(gateComplete(_req.params.id)); } catch (error) { failure(res, error, '办结失败'); } });
app.post('/api/gate/appointments/:id/cancel', (_req, res) => { try { res.json(gateCancel(_req.params.id)); } catch (error) { failure(res, error, '取消失败'); } });
app.post('/api/gate/appointments/:id/reopen', (_req, res) => { try { res.json(gateReopen(_req.params.id)); } catch (error) { failure(res, error, '恢复预约失败'); } });
app.delete('/api/gate/appointments/:id', (req, res) => { const result = deleteGateAppointment(req.params.id); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/equipment', (_req, res) => res.json(equipment));
app.get('/api/tasks', (_req, res) => res.json(prioritizeTasks()));
app.post('/api/tasks', (req, res) => { try { res.status(201).json(createYardTask(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建作业任务失败' }); } });
app.patch('/api/tasks/:id', (req, res) => { try { const result = updateYardTask(req.params.id, req.body); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新作业任务失败' }); } });
app.delete('/api/tasks/:id', (req, res) => { const result = deleteYardTask(req.params.id); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json({ deleted: true, id: result.id }); });
app.patch('/api/tasks/:id/assign', (req, res) => { const result = assignTask(req.params.id, req.body.equipmentId); if (!result) return res.status(404).json({ message: '任务或设备不存在' }); res.json(result); });
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'port-yard-operations' }));
const port = Number(process.env.PORT || 4107); app.listen(port, () => console.log(`port yard API listening on ${port}`));
