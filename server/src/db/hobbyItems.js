import db from './index.js';

const insertStmt = db.prepare(`
  INSERT INTO hobby_items
    (operator_id, category, name, location, hours, rating, review, visited, visited_color)
  VALUES
    (@operatorId, @category, @name, @location, @hours, @rating, @review, @visited, @visitedColor)
`);
const updateStmt = db.prepare(`
  UPDATE hobby_items SET
    name = @name, location = @location, hours = @hours, rating = @rating,
    review = @review, visited = @visited, visited_color = @visitedColor,
    updated_at = datetime('now')
  WHERE id = @id AND operator_id = @operatorId
`);
const deleteStmt = db.prepare(`DELETE FROM hobby_items WHERE id = ? AND operator_id = ?`);
const byIdStmt = db.prepare(`SELECT * FROM hobby_items WHERE id = ? AND operator_id = ?`);
const byCategoryStmt = db.prepare(
  `SELECT * FROM hobby_items WHERE operator_id = ? AND category = ? ORDER BY created_at DESC`,
);

export function createHobbyItem(item) {
  const info = insertStmt.run(item);
  return byIdStmt.get(info.lastInsertRowid, item.operatorId);
}

export function updateHobbyItem(item) {
  updateStmt.run(item);
  return byIdStmt.get(item.id, item.operatorId);
}

export function deleteHobbyItem(id, operatorId) {
  return deleteStmt.run(id, operatorId).changes > 0;
}

export function getHobbyItem(id, operatorId) {
  return byIdStmt.get(id, operatorId) ?? null;
}

export function listHobbyItemsByCategory(operatorId, category) {
  return byCategoryStmt.all(operatorId, category);
}
