import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server.js';

test('POST /chat without token returns 401', async () => {
  const server = await startServer(0);
  const port = server.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'hello' })
  });

  assert.equal(res.status, 401);
  server.close();
});

test('POST /chat with wrong token returns 401', async () => {
  const server = await startServer(0);
  const port = server.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer wrong-token'
    },
    body: JSON.stringify({ text: 'hello' })
  });

  assert.equal(res.status, 401);
  server.close();
});
