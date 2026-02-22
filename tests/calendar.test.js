import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarFile, parseCalendarDir } from '../server.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function mkdtemp() {
  const d = path.join(os.tmpdir(), 'vctest-' + Date.now());
  await mkdir(d);
  return d;
}

test('parseCalendarFile parses frontmatter correctly', async () => {
  const tmpDir = await mkdtemp();
  const content = `---
title: Teszt esemény
allDay: false
date: 2026-02-26
startTime: 17:00
endTime: 19:00
type: single
endDate: null
---
# Tartalom
`;
  const file = path.join(tmpDir, '2026-02-26 Teszt.md');
  await writeFile(file, content);
  const result = await parseCalendarFile(file, 'calendar');
  assert.equal(result.title, 'Teszt esemény');
  assert.equal(result.date, '2026-02-26');
  assert.equal(result.startTime, '17:00');
  assert.equal(result.endTime, '19:00');
  assert.equal(result.source, 'calendar');
  assert.equal(result.color, '#4a9eff');
  await rm(tmpDir, { recursive: true });
});

test('parseCalendarFile returns null for missing date', async () => {
  const tmpDir = await mkdtemp();
  const content = `---\ntitle: No date\n---\n`;
  const file = path.join(tmpDir, 'nodate.md');
  await writeFile(file, content);
  const result = await parseCalendarFile(file, 'calendar');
  assert.equal(result, null);
  await rm(tmpDir, { recursive: true });
});

test('parseCalendarDir returns empty array for missing dir', async () => {
  const result = await parseCalendarDir('/tmp/nonexistent-vctest-12345', 'calendar');
  assert.deepEqual(result, []);
});
