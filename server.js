import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4'
};

async function loadConfig() {
  const raw = await readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
}

export async function parseCalendarFile(filePath, source) {
  const raw = await readFile(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    fm[key] = val === 'null' ? null : val;
  }
  if (!fm.date) return null;
  return {
    id: filePath,
    title: fm.title || path.basename(filePath, '.md'),
    date: fm.date,
    startTime: fm.startTime || null,
    endTime: fm.endTime || null,
    allDay: fm.allDay === 'true',
    source,
    color: source === 'calendar' ? '#4a9eff' : '#e94560'
  };
}

export async function parseCalendarDir(dirPath, source) {
  let files;
  try {
    files = await readdir(dirPath);
  } catch { return []; }
  const events = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const ev = await parseCalendarFile(path.join(dirPath, f), source);
    if (ev) events.push(ev);
  }
  return events;
}

export function parseAgentResponse(jsonString) {
  const data = JSON.parse(jsonString);
  const payload = data?.result?.payloads?.[0] || {};
  return {
    text: payload.text || '',
    mediaUrl: payload.mediaUrl || null
  };
}

export function callAgent(config, message) {
  return new Promise((resolve, reject) => {
    const args = [
      'agent',
      '--to', config.sessionTo,
      '--message', message,
      '--json'
    ];

    const env = {
      ...process.env,
      XDG_RUNTIME_DIR: `/run/user/${process.getuid()}`,
      PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}`
    };

    const proc = spawn(config.openclaw, args, { env });
    let stdout = '';
    let stderr = '';

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn openclaw: ${err.message}`));
    });

    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`openclaw exited ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(parseAgentResponse(stdout));
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}\nOutput: ${stdout}`));
      }
    });
  });
}

function router(req, res, config) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Auth check for /chat endpoint
  if (url.pathname === '/chat') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!config.token || token !== config.token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  if (url.pathname === '/api/calendar') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!config.token || token !== config.token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  if (url.pathname === '/api/calendar' && req.method === 'GET') {
    const year = parseInt(url.searchParams.get('year') || new Date().getFullYear());
    const month = parseInt(url.searchParams.get('month') || (new Date().getMonth() + 1));
    const prefix = String(year) + '-' + String(month).padStart(2, '0');
    const vaultPath = config.vaultPath || '';
    Promise.all([
      parseCalendarDir(path.join(vaultPath, 'calendar'), 'calendar'),
      parseCalendarDir(path.join(vaultPath, 'vnaptár'), 'vnaptár')
    ]).then(([ev1, ev2]) => {
      const all = ev1.concat(ev2).filter(e => e.date.startsWith(prefix));
      all.sort((a, b) => (a.date + (a.startTime||'00:00')).localeCompare(b.date + (b.startTime||'00:00')));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(all));
    }).catch(e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (url.pathname === '/chat' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_BODY = 64 * 1024;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.resume();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_BODY) return; // már kezeltük
      try {
        const { text } = JSON.parse(body);
        if (!text || typeof text !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text field required' }));
          return;
        }
        const result = await callAgent(config, text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Static file serving from public/
  if (req.method === 'GET') {
    const safePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(__dirname, 'public', path.normalize(safePath));
    const ext = path.extname(filePath);

    if (filePath.startsWith(path.join(__dirname, 'public')) && existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
}

export async function startServer(port) {
  const config = await loadConfig().catch(() => ({ port: port || 8080, token: '', openclaw: 'openclaw', sessionTo: '+11111111111' }));
  const listenPort = port !== undefined ? port : config.port;

  const server = http.createServer((req, res) => {
    try {
      router(req, res, config);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    }
  });

  await new Promise(resolve => server.listen(listenPort, '0.0.0.0', resolve));
  return server;
}

// Direct run
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = await loadConfig();
  const server = await startServer(config.port);
  console.log(`iPadClaw listening on http://0.0.0.0:${config.port}`);
  console.log(`Local network: http://<SERVER_IP>:${config.port}`);
}
