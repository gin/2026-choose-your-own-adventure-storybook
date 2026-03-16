/* eslint-disable */
// @ts-nocheck
import { loadEnvConfig } from '@next/env';
const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleLiveConnection } from './src/server/live/handle-live-connection';

const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!);
    if (pathname === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname?.startsWith('/_next')) {
      // Let Next.js handle its own HMR WebSocket upgrades
      return;
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', handleLiveConnection);

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
