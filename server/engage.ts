import { db } from './db';

// ── Engagements (targets) + findings: turn the reference toolkit into a per-target workspace ──
export interface Target {
  id: number; name: string; host: string | null; lhost: string | null;
  scope: string | null; status: string; notes: string | null; is_active: boolean;
  created_at: string; updated_at: string;
}
export interface Finding {
  id: number; target_id: number | null; title: string; severity: string;
  url: string | null; status: string; body: string | null; sort: number;
  created_at: string; updated_at: string;
}

const tRow = (r: any): Target => ({ ...r, is_active: !!r.is_active });

export function listTargets(): Target[] {
  return (db.prepare('SELECT * FROM targets ORDER BY is_active DESC, updated_at DESC').all() as any[]).map(tRow);
}
export function getTarget(id: number): Target | null {
  const r = db.prepare('SELECT * FROM targets WHERE id=?').get(id);
  return r ? tRow(r) : null;
}
export function createTarget(i: Partial<Target>): Target {
  const id = Number(db.prepare(
    'INSERT INTO targets(name,host,lhost,scope,status,notes) VALUES(@name,@host,@lhost,@scope,@status,@notes)',
  ).run({
    name: i.name ?? 'target', host: i.host ?? null, lhost: i.lhost ?? null,
    scope: i.scope ?? null, status: i.status ?? 'active', notes: i.notes ?? null,
  }).lastInsertRowid);
  // first target becomes active automatically
  if (!db.prepare('SELECT 1 FROM targets WHERE is_active=1').get()) activateTarget(id);
  return getTarget(id)!;
}
export function updateTarget(id: number, p: Partial<Target>): Target | null {
  const cur = getTarget(id);
  if (!cur) return null;
  db.prepare(
    `UPDATE targets SET name=@name, host=@host, lhost=@lhost, scope=@scope, status=@status, notes=@notes, updated_at=datetime('now') WHERE id=@id`,
  ).run({
    name: p.name ?? cur.name,
    host: p.host !== undefined ? p.host : cur.host,
    lhost: p.lhost !== undefined ? p.lhost : cur.lhost,
    scope: p.scope !== undefined ? p.scope : cur.scope,
    status: p.status ?? cur.status,
    notes: p.notes !== undefined ? p.notes : cur.notes,
    id,
  });
  return getTarget(id);
}
export function deleteTarget(id: number): boolean {
  db.prepare('DELETE FROM findings WHERE target_id=?').run(id); // cascade findings
  return db.prepare('DELETE FROM targets WHERE id=?').run(id).changes > 0;
}
export function activateTarget(id: number): Target | null {
  if (!getTarget(id)) return null; // unknown id: don't deactivate the current target then 404
  db.prepare('UPDATE targets SET is_active=0 WHERE is_active=1').run();
  db.prepare("UPDATE targets SET is_active=1, updated_at=datetime('now') WHERE id=?").run(id);
  return getTarget(id);
}

export function listFindings(targetId?: number): Finding[] {
  if (targetId != null) return db.prepare('SELECT * FROM findings WHERE target_id=? ORDER BY sort, id').all(targetId) as Finding[];
  return db.prepare('SELECT * FROM findings ORDER BY sort, id').all() as Finding[];
}
export function getFinding(id: number): Finding | null {
  return (db.prepare('SELECT * FROM findings WHERE id=?').get(id) as Finding) ?? null;
}
export function createFinding(i: Partial<Finding>): Finding {
  const id = Number(db.prepare(
    'INSERT INTO findings(target_id,title,severity,url,status,body,sort) VALUES(@target_id,@title,@severity,@url,@status,@body,@sort)',
  ).run({
    target_id: i.target_id ?? null, title: i.title ?? 'finding', severity: i.severity ?? 'medium',
    url: i.url ?? null, status: i.status ?? 'open', body: i.body ?? null, sort: i.sort ?? 0,
  }).lastInsertRowid);
  return getFinding(id)!;
}
export function updateFinding(id: number, p: Partial<Finding>): Finding | null {
  const cur = getFinding(id);
  if (!cur) return null;
  db.prepare(
    `UPDATE findings SET target_id=@target_id, title=@title, severity=@severity, url=@url, status=@status, body=@body, sort=@sort, updated_at=datetime('now') WHERE id=@id`,
  ).run({
    target_id: p.target_id !== undefined ? p.target_id : cur.target_id,
    title: p.title ?? cur.title, severity: p.severity ?? cur.severity,
    url: p.url !== undefined ? p.url : cur.url, status: p.status ?? cur.status,
    body: p.body !== undefined ? p.body : cur.body, sort: p.sort ?? cur.sort, id,
  });
  return getFinding(id);
}
export function deleteFinding(id: number): boolean {
  return db.prepare('DELETE FROM findings WHERE id=?').run(id).changes > 0;
}
