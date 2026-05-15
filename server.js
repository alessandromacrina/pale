const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gymtrack-change-me-in-production-use-env-var';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'gym.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workout_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    data        TEXT    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS training_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    plan_id          INTEGER,
    plan_name        TEXT    DEFAULT '',
    day_name         TEXT    DEFAULT '',
    day_index        INTEGER DEFAULT 0,
    date             TEXT    NOT NULL,
    duration_minutes INTEGER DEFAULT 0,
    notes            TEXT    DEFAULT '',
    completed_at     TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id)  REFERENCES workout_plans(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS session_sets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     INTEGER NOT NULL,
    exercise_name  TEXT    NOT NULL,
    exercise_index INTEGER DEFAULT 0,
    set_number     INTEGER NOT NULL,
    reps           INTEGER,
    weight         REAL,
    FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_plans_user     ON workout_plans(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user  ON training_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sets_session   ON session_sets(session_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise  ON session_sets(exercise_name);
`);

// ── Middleware ─────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password minimo 6 caratteri' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username.trim(), email.trim().toLowerCase(), hash);
    const token = jwt.sign({ id: r.lastInsertRowid, username: username.trim() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: username.trim() });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Username o email già in uso' });
    res.status(500).json({ error: 'Errore del server' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Campi mancanti' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Email o password errati' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// ── Plans ──────────────────────────────────────────────────────────────────────
app.get('/api/plans', auth, (req, res) => {
  const plans = db.prepare('SELECT id, name, description, created_at FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(plans);
});

app.get('/api/plans/:id', auth, (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Piano non trovato' });
  plan.data = JSON.parse(plan.data);
  res.json(plan);
});

app.post('/api/plans', auth, (req, res) => {
  const { name, description, data } = req.body || {};
  if (!name?.trim() || !data) return res.status(400).json({ error: 'Dati mancanti' });
  const r = db.prepare('INSERT INTO workout_plans (user_id, name, description, data) VALUES (?, ?, ?, ?)').run(req.user.id, name.trim(), description || '', JSON.stringify(data));
  res.json({ id: r.lastInsertRowid, name: name.trim() });
});

app.put('/api/plans/:id', auth, (req, res) => {
  const { name, description, data } = req.body || {};
  const plan = db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Piano non trovato' });
  db.prepare('UPDATE workout_plans SET name = ?, description = ?, data = ? WHERE id = ?').run(name?.trim() || plan.name, description || '', JSON.stringify(data), req.params.id);
  res.json({ success: true });
});

app.delete('/api/plans/:id', auth, (req, res) => {
  const plan = db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Piano non trovato' });
  db.prepare('DELETE FROM workout_plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Sessions ───────────────────────────────────────────────────────────────────
app.get('/api/sessions', auth, (req, res) => {
  const sessions = db.prepare(`
    SELECT id, plan_name, day_name, date, duration_minutes, completed_at
    FROM training_sessions WHERE user_id = ?
    ORDER BY date DESC, completed_at DESC LIMIT 100
  `).all(req.user.id);
  res.json(sessions);
});

app.get('/api/sessions/:id', auth, (req, res) => {
  const session = db.prepare('SELECT * FROM training_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Sessione non trovata' });
  const sets = db.prepare('SELECT * FROM session_sets WHERE session_id = ? ORDER BY exercise_index, set_number').all(req.params.id);
  res.json({ ...session, sets });
});

app.post('/api/sessions', auth, (req, res) => {
  const { plan_id, plan_name, day_name, day_index, date, duration_minutes, notes, sets } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Data mancante' });
  const r = db.prepare(`
    INSERT INTO training_sessions (user_id, plan_id, plan_name, day_name, day_index, date, duration_minutes, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, plan_id || null, plan_name || '', day_name || '', day_index ?? 0, date, duration_minutes || 0, notes || '');
  const sid = r.lastInsertRowid;
  if (Array.isArray(sets) && sets.length > 0) {
    const stmt = db.prepare('INSERT INTO session_sets (session_id, exercise_name, exercise_index, set_number, reps, weight) VALUES (?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction(arr => { for (const s of arr) stmt.run(sid, s.exercise_name, s.exercise_index ?? 0, s.set_number, s.reps ?? null, s.weight ?? null); });
    insertMany(sets);
  }
  res.json({ id: sid });
});

app.delete('/api/sessions/:id', auth, (req, res) => {
  const s = db.prepare('SELECT id FROM training_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Sessione non trovata' });
  db.prepare('DELETE FROM training_sessions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Progress ───────────────────────────────────────────────────────────────────
app.get('/api/progress/exercises', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT ss.exercise_name
    FROM session_sets ss
    JOIN training_sessions ts ON ss.session_id = ts.id
    WHERE ts.user_id = ?
    ORDER BY ss.exercise_name
  `).all(req.user.id);
  res.json(rows.map(r => r.exercise_name));
});

app.get('/api/progress/:exercise', auth, (req, res) => {
  const name = decodeURIComponent(req.params.exercise);
  // Best set per session (max weight, then max volume)
  const rows = db.prepare(`
    SELECT ts.date, ts.day_name,
           MAX(ss.weight) as max_weight,
           MAX(ss.reps)   as max_reps,
           SUM(ss.reps * COALESCE(ss.weight, 0)) as volume
    FROM session_sets ss
    JOIN training_sessions ts ON ss.session_id = ts.id
    WHERE ts.user_id = ? AND ss.exercise_name = ?
    GROUP BY ts.id
    ORDER BY ts.date ASC
  `).all(req.user.id, name);
  res.json(rows);
});

// ── Stats ──────────────────────────────────────────────────────────────────────
app.get('/api/stats', auth, (req, res) => {
  const uid = req.user.id;
  const totalSessions = db.prepare('SELECT COUNT(*) c FROM training_sessions WHERE user_id = ?').get(uid).c;
  const totalSets     = db.prepare('SELECT COUNT(*) c FROM session_sets ss JOIN training_sessions ts ON ss.session_id = ts.id WHERE ts.user_id = ?').get(uid).c;
  const totalVolume   = db.prepare('SELECT COALESCE(SUM(ss.reps * ss.weight), 0) v FROM session_sets ss JOIN training_sessions ts ON ss.session_id = ts.id WHERE ts.user_id = ? AND ss.weight IS NOT NULL').get(uid).v;
  const lastSession   = db.prepare('SELECT date, day_name, plan_name FROM training_sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 1').get(uid);
  const weekSessions  = db.prepare("SELECT COUNT(*) c FROM training_sessions WHERE user_id = ? AND date >= date('now', '-7 days')").get(uid).c;
  res.json({ totalSessions, totalSets, totalVolume: Math.round(totalVolume), lastSession, weekSessions });
});

// ── SPA fallback ───────────────────────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`✅ GymTrack running → http://localhost:${PORT}`));
