import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentResponse } from '../server.js';

test('parseAgentResponse extracts text and mediaUrl', () => {
  const json = JSON.stringify({
    status: 'ok',
    result: {
      payloads: [{ text: 'Helló! Miben segíthetek?', mediaUrl: null }]
    }
  });
  const result = parseAgentResponse(json);
  assert.equal(result.text, 'Helló! Miben segíthetek?');
  assert.equal(result.mediaUrl, null);
});

test('parseAgentResponse handles missing payload gracefully', () => {
  const json = JSON.stringify({ status: 'ok', result: { payloads: [] } });
  const result = parseAgentResponse(json);
  assert.equal(result.text, '');
  assert.equal(result.mediaUrl, null);
});
