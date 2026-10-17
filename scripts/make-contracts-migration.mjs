// Builds migrations/0009_crm_contracts.sql from the corrected contracts Tony approved
// (docs/contracts/*(corrected).md, made by scripts/contract-fixes.mjs).
//   node scripts/make-contracts-migration.mjs
import fs from 'node:fs';
import { mdToHtml } from '../functions-lib/rich-html.js';

const dir = 'docs/contracts/';
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const now = '2026-10-17T06:00:00.000Z';
const contracts = [
  ['wedding', 'Wedding contract', 'wedding contract (corrected).md'],
  ['wedding-no-ads', 'Wedding contract (no ads)', 'wedding contract no ads (corrected).md'],
  ['nzipp', 'NZIPP terms', 'nzipp contract (corrected).md'],
];
const body = (file) => mdToHtml(fs.readFileSync(dir + file, 'utf8').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());

const sql = `-- Studio CRM contracts. Contract templates (Settings > Contracts) hold Tony's contracts, loaded
-- here from the corrected versions he approved on 17 Oct 2026 (docs/contracts/). Each job type
-- has a default contract (lists.contract_key); each quote can choose another (quotes.contract_key).
-- When a quote is accepted, a contract is made for the job: a copy of the template's wording
-- (so later edits never change it) with a fingerprint (SHA-256) of exactly what's signed.
CREATE TABLE contract_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,          -- HTML from the rich editor
  updated_at TEXT NOT NULL
);
${contracts.map(([k, n, f]) => `INSERT INTO contract_templates (key, name, body, updated_at) VALUES (${q(k)}, ${q(n)}, ${q(body(f))}, '${now}');`).join('\n')}

ALTER TABLE lists ADD COLUMN contract_key TEXT;
UPDATE lists SET contract_key = 'wedding' WHERE kind = 'job_type' AND value = 'Wedding';
ALTER TABLE quotes ADD COLUMN contract_key TEXT;

-- status: sent | signed | void
CREATE TABLE contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  quote_id INTEGER REFERENCES quotes (id),
  token TEXT NOT NULL UNIQUE,
  template_key TEXT,
  name TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',  -- the event details shown above the wording (JSON)
  body TEXT NOT NULL,                  -- the wording, as sent
  fingerprint TEXT NOT NULL,           -- SHA-256 of details + body
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TEXT,
  viewed_at TEXT,
  signed_name TEXT,
  signed_at TEXT,
  signed_ip TEXT,
  signed_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX contracts_job ON contracts (job_id);
`;
fs.writeFileSync('migrations/0009_crm_contracts.sql', sql);
console.log('written', (sql.length / 1024).toFixed(0) + 'KB');
