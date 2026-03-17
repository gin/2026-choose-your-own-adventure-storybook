/* eslint-disable */
// @ts-nocheck
import { loadEnvConfig } from '@next/env';
const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);

import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleLiveConnection } from './src/server/live/handle-live-connection';

const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let isPrepared = false;
const server = createServer((req, res) => {
  if (!isPrepared) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('App is starting... please wait.');
    return;
  }
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || `localhost:${port}`;
  const parsedUrl = new URL(req.url!, `${protocol}://${host}`);
  handle(req, res, {
    pathname: parsedUrl.pathname,
    query: Object.fromEntries(parsedUrl.searchParams),
  } as any);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (!isPrepared) {
    socket.destroy();
    return;
  }
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  const host = request.headers.host || `localhost:${port}`;
  const parsedUrl = new URL(request.url!, `${protocol}://${host}`);
  const pathname = parsedUrl.pathname;
  if (pathname === '/api/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname?.startsWith('/_next')) {
    return;
  } else {
    socket.destroy();
  }
});

wss.on('connection', handleLiveConnection);

server.listen(port, '0.0.0.0', () => {
  console.log(`> Listening on http://0.0.0.0:${port}`);
  app.prepare()
    .then(() => {
      isPrepared = true;
      console.log('> Next.js is ready');
    })
    .catch((err) => {
      console.error('Next.js preparation failed:', err);
      process.exit(1);
    });
});
