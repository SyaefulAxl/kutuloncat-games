import fs from 'fs';
import path from 'path';
import duckdb from 'duckdb';

const base = process.cwd();
const scoreFile = path.join(base, 'data', 'scores.json');
const phraseFile = path.join(base, 'data', 'phrases.json');
const dbPath = path.join(base, 'data', 'kutuloncat_migrated.duckdb');

const scores = fs.existsSync(scoreFile) ? JSON.parse(fs.readFileSync(scoreFile,'utf-8')).scores || [] : [];
const phrases = fs.existsSync(phraseFile) ? JSON.parse(fs.readFileSync(phraseFile,'utf-8')).phrases || [] : [];

const db = new duckdb.Database(dbPath);
const run = (sql) => new Promise((res, rej)=>db.run(sql, err=> err?rej(err):res(true)));

const esc = (v='') => `'${String(v).replace(/'/g,"''")}'`;

await run(`CREATE TABLE IF NOT EXISTS scores (id VARCHAR, game VARCHAR, playerName VARCHAR, score INTEGER, meta VARCHAR, createdAt VARCHAR)`);
await run(`CREATE TABLE IF NOT EXISTS hangman_phrases (id VARCHAR, phrase VARCHAR, hint VARCHAR, source VARCHAR, createdAt VARCHAR)`);
await run(`DELETE FROM scores`);
await run(`DELETE FROM hangman_phrases`);

for (const s of scores) {
  await run(`INSERT INTO scores VALUES (${esc(s.id||'')},${esc(s.game||'')},${esc(s.playerName||'Guest')},${Number(s.score||0)},${esc(JSON.stringify(s.meta||{}))},${esc(s.createdAt||new Date().toISOString())})`);
}
for (const p of phrases) {
  await run(`INSERT INTO hangman_phrases VALUES (${esc(p.id||'')},${esc(p.phrase||'')},${esc(p.hint||'umum')},${esc(p.source||'json')},${esc(new Date().toISOString())})`);
}

console.log(JSON.stringify({ok:true, dbPath, scores:scores.length, phrases:phrases.length}, null, 2));
process.exit(0);
