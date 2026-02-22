import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  const raw = await readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
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
