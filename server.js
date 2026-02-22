import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  const raw = await readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
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
      XDG_RUNTIME_DIR: `/run/user/${process.getuid()}`
    };

    const proc = spawn(config.openclaw, args, { env });
    let stdout = '';
    let stderr = '';

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

  if (url.pathname === '/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
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

  res.writeHead(404);
  res.end('Not found');
}

export async function startServer(port) {
  const config = await loadConfig().catch(() => ({ port: port || 8080, token: '', openclaw: 'openclaw', sessionTo: '+11111111111' }));
  const listenPort = port !== undefined ? port : config.port;

  const server = http.createServer((req, res) => {
    router(req, res, config);
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
