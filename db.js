const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '.data');
const FILE_DB_PATH = path.join(DATA_DIR, 'sessions.json');
const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
let usingPostgres = false;

function shouldUseSsl(databaseUrl) {
  if (!databaseUrl) return false;
  if (process.env.PGSSLMODE === 'disable') return false;
  return !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
}

async function initPersistence(sessionsMap) {
  if (DATABASE_URL) {
    let Pool;
    try {
      ({ Pool } = require('pg'));
    } catch (err) {
      throw new Error('DATABASE_URL is set, but the pg package is not installed. Run npm install before starting the server.');
    }

    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS island_survivor_sessions (
        code TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_island_survivor_sessions_updated_at
      ON island_survivor_sessions (updated_at DESC)
    `);

    const result = await pool.query('SELECT code, state FROM island_survivor_sessions ORDER BY updated_at DESC');
    sessionsMap.clear();
    for (const row of result.rows) {
      sessionsMap.set(row.code, row.state);
    }
    usingPostgres = true;
    return { type: 'postgres', count: result.rowCount };
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE_DB_PATH)) {
    try {
      const raw = fs.readFileSync(FILE_DB_PATH, 'utf8');
      const saved = JSON.parse(raw || '{}');
      sessionsMap.clear();
      for (const [code, session] of Object.entries(saved.sessions || {})) {
        sessionsMap.set(code, session);
      }
      return { type: 'file', count: sessionsMap.size };
    } catch (err) {
      console.warn('Could not read local session store. Starting with an empty store.', err.message);
    }
  }
  return { type: 'file', count: 0 };
}

async function saveSession(session) {
  if (!session || !session.code) return;
  if (usingPostgres && pool) {
    await pool.query(
      `INSERT INTO island_survivor_sessions (code, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (code)
       DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [session.code, JSON.stringify(session)]
    );
    return;
  }

  await saveFileStore();
}

async function deleteSession(code, sessionsMap) {
  if (!code) return;
  if (usingPostgres && pool) {
    await pool.query('DELETE FROM island_survivor_sessions WHERE code = $1', [code]);
    return;
  }
  if (sessionsMap) await saveFileStore(sessionsMap);
}

async function saveFileStore(sessionsMapOverride) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const source = sessionsMapOverride || global.__ISLAND_SURVIVOR_SESSIONS__;
  const sessions = {};
  if (source) {
    for (const [code, session] of source.entries()) sessions[code] = session;
  }
  const tempPath = `${FILE_DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ sessions }, null, 2));
  fs.renameSync(tempPath, FILE_DB_PATH);
}

function persistenceInfo() {
  return {
    type: usingPostgres ? 'postgres' : 'file',
    table: usingPostgres ? 'island_survivor_sessions' : null,
    path: usingPostgres ? null : FILE_DB_PATH
  };
}

module.exports = {
  initPersistence,
  saveSession,
  deleteSession,
  persistenceInfo
};
