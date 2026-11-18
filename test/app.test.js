import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const config = { TRUST_PROXY:'false', RATE_LIMIT_WINDOW_MS:60000, RATE_LIMIT_MAX:100, CORE_SETUP_KEY:'test-setup-key-that-is-long-enough' };
const db = {
  countOwners:async()=>1,
  findUserByEmail:async()=>null,
  findUserById:async()=>null,
  writeAudit:async()=>{},
  listAudit:async()=>[]
};
test('health endpoint reports service status', async t => {
  const app = createApp({db,config,corsOrigins:['http://localhost:3000']});
  const server = app.listen(0);
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.service,'og-core');
});
test('protected profile endpoint rejects missing token', async t => {
  const app = createApp({db,config,corsOrigins:[]});
  const server = app.listen(0);
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/me`);
  assert.equal(response.status,401);
});
