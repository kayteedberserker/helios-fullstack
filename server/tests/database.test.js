import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertDatabaseTopology, databaseDiagnosis, formatDatabaseError } from '../lib/database.js';

test('authentication failures nested in driver topology errors produce actionable private diagnostics', () => {
  const error = { name: 'MongooseServerSelectionError', message: 'mongodb+srv://private-user:private-password@private-host/helios', reason: { servers: new Map([['private-host', { error: { code: 18, message: 'bad auth : authentication failed private-password' } }]]) } };
  assert.equal(databaseDiagnosis(error).code, 'DB_AUTH');
  const message = formatDatabaseError(error);
  for (const secret of ['private-user', 'private-password', 'private-host', 'mongodb+srv://']) assert.equal(message.includes(secret), false);
});
test('DNS refusals are distinguished from refused database sockets', () => {
  assert.equal(databaseDiagnosis({ code: 'ECONNREFUSED', syscall: 'querySrv', message: 'querySrv ECONNREFUSED hidden-host' }).code, 'DB_DNS');
  assert.equal(databaseDiagnosis({ code: 'ECONNREFUSED', syscall: 'connect', message: 'connect ECONNREFUSED hidden-host' }).code, 'DB_REFUSED');
});
test('TLS, permission, malformed URI, and timeout failures have distinct diagnoses', () => {
  const cases = [[{ message: 'self signed certificate', code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, 'DB_TLS'], [{ code: 13 }, 'DB_PERMISSIONS'], [{ name: 'MongoParseError', message: 'private password' }, 'DB_URI'], [{ name: 'MongooseServerSelectionError' }, 'DB_NETWORK']];
  for (const [error, code] of cases) assert.equal(databaseDiagnosis(error).code, code);
});
test('unknown errors and cyclic causes never leak raw driver details', () => {
  const error = { message: 'secret-document-content', name: 'UnrecognisedError' }; error.cause = error;
  assert.equal(databaseDiagnosis(error).code, 'DB_UNKNOWN');
  assert.equal(formatDatabaseError(error, 'creating database indexes').includes('secret-document-content'), false);
});
test('database topology accepts transactions-capable deployments and explains standalone servers', () => {
  assert.doesNotThrow(() => assertDatabaseTopology({ setName: 'rs0' }));
  assert.doesNotThrow(() => assertDatabaseTopology({ msg: 'isdbgrid' }));
  assert.throws(() => assertDatabaseTopology({ isWritablePrimary: true }), error => databaseDiagnosis(error).code === 'DB_REPLICA');
});
test('the diagnostic command handles missing and malformed environment values without connecting or leaking them', () => {
  for (const [uri, code] of [['', 'DB_ENV'], ['https://private-user:private-password@private-host', 'DB_URI'], ['mongodb+srv://user:<db_password>@cluster.example.com/helios', 'DB_URI']]) {
    const result = spawnSync(process.execPath, ['server/scripts/check-db.js'], { env: { ...process.env, MONGODB_URI: uri }, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, new RegExp(code));
    assert.equal((result.stdout + result.stderr).includes('private-password'), false);
    assert.equal((result.stdout + result.stderr).includes('private-host'), false);
  }
});
