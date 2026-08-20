-- 설계문서 §4.1 영구 저장 구조

CREATE TABLE IF NOT EXISTS operators (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  account_type  TEXT NOT NULL DEFAULT 'mc' CHECK (account_type IN ('mc', 'personal')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id       INTEGER NOT NULL REFERENCES operators(id),
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'individual' CHECK (mode IN ('individual', 'team')),
  max_participants  INTEGER NOT NULL DEFAULT 50,
  logo_path         TEXT,
  scheduled_at      TEXT,
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'ended')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_operator ON events(operator_id);

-- 4자리 코드는 "진행 중이 아닌(종료된)" 이벤트끼리는 재사용 가능하지만,
-- 대기/진행 중인 이벤트끼리는 겹치면 안 된다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_active_code
  ON events(code) WHERE status != 'ended';

CREATE TABLE IF NOT EXISTS participants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  nickname      TEXT NOT NULL,
  pin           TEXT NOT NULL,
  team_id       TEXT,
  score         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'removed')),
  joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, nickname, pin)
);

CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);

CREATE TABLE IF NOT EXISTS game_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES events(id),
  game_type   TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  ended_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_records_event ON game_records(event_id);

-- 일반인 전용 계정의 개인 일기. 하루에 한 편만 쓸 수 있어 (operator_id, entry_date) 로
-- 유일해야 한다 — upsert 로 같은 날짜에 다시 쓰면 덮어쓴다.
CREATE TABLE IF NOT EXISTS diary_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id   INTEGER NOT NULL REFERENCES operators(id),
  entry_date    TEXT NOT NULL, -- 'YYYY-MM-DD'
  weather       TEXT NOT NULL,
  mood_weather  TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (operator_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_diary_entries_operator_date ON diary_entries(operator_id, entry_date);

-- 취미 카테고리(카페/식당/여행장소/책/음악/영화) 공용 테이블. location/hours 는
-- 카페·식당·여행장소만 쓴다(책/음악/영화는 NULL). visited/visited_color 는
-- 여행장소 전용 — 지도에 노란(위시) vs 분홍·파랑(방문) 크레파스로 칠하는 데 쓴다.
CREATE TABLE IF NOT EXISTS hobby_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id    INTEGER NOT NULL REFERENCES operators(id),
  category       TEXT NOT NULL CHECK (category IN ('cafe', 'restaurant', 'travel', 'book', 'music', 'movie')),
  name           TEXT NOT NULL,
  location       TEXT,
  hours          TEXT,
  rating         INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  review         TEXT NOT NULL DEFAULT '',
  visited        INTEGER NOT NULL DEFAULT 0 CHECK (visited IN (0, 1)),
  visited_color  TEXT CHECK (visited_color IN ('pink', 'blue')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hobby_items_operator_category ON hobby_items(operator_id, category);
