import db from './index.js';

const insertStmt = db.prepare(`
  INSERT INTO certificates (operator_id, name, detail, achieved)
  VALUES (@operatorId, @name, @detail, @achieved)
`);
const updateStmt = db.prepare(`
  UPDATE certificates SET name = @name, detail = @detail, achieved = @achieved, updated_at = datetime('now')
  WHERE id = @id AND operator_id = @operatorId
`);
const deleteStmt = db.prepare(`DELETE FROM certificates WHERE id = ? AND operator_id = ?`);
const byIdStmt = db.prepare(`SELECT * FROM certificates WHERE id = ? AND operator_id = ?`);
const listStmt = db.prepare(`SELECT * FROM certificates WHERE operator_id = ? ORDER BY created_at DESC`);

export function createCertificate(item) {
  const info = insertStmt.run(item);
  return byIdStmt.get(info.lastInsertRowid, item.operatorId);
}

export function updateCertificate(item) {
  updateStmt.run(item);
  return byIdStmt.get(item.id, item.operatorId);
}

export function deleteCertificate(id, operatorId) {
  return deleteStmt.run(id, operatorId).changes > 0;
}

export function getCertificate(id, operatorId) {
  return byIdStmt.get(id, operatorId) ?? null;
}

export function listCertificates(operatorId) {
  return listStmt.all(operatorId);
}
