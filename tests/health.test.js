import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server.js';

test('/health returns ok', async (t) => {
  const server = await startServer(0); // port 0 = random
  const port = server.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);

  server.close();
});
