import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Browser preview shares an origin with this local proxy. Native apps call the API directly.
const root = resolve(import.meta.dirname, '../dist');
const target = process.env.GAME_API_URL || 'http://127.0.0.1:8080';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff': 'font/woff', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await fetch(`${target}${path}`, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          ...(req.headers['x-request-id'] ? { 'X-Request-Id': req.headers['x-request-id'] } : {}),
        },
        body: req.method === 'GET' ? undefined : Buffer.concat(chunks),
        signal: AbortSignal.timeout(15000),
      });
      res.writeHead(response.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const file = resolve(root, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'PREVIEW_UNAVAILABLE', message: 'Check the local game server and exported app.' }));
  }
});
server.listen(Number(process.env.PORT || 8090), '127.0.0.1', () => console.log('Ember & Rune preview: http://127.0.0.1:8090'));
