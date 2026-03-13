/* eslint-disable */
// @ts-nocheck
import { loadEnvConfig } from '@next/env';
const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { generateIllustration } from './src/tools/generate_illustration';

const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

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

  wss.on('connection', async (wsClient) => {
    console.log('Client connected to /api/live');
    
    let session: any = null;

    wsClient.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        if (session) {
          if (msg.type === 'audio') {
            // Send raw audio via sendRealtimeInput (for microphone PCM data)
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: 'audio/pcm;rate=16000'
              }
            });
          }
          if (msg.type === 'text') {
            // Use sendClientContent for text messages (sendRealtimeInput text not supported on this model)
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: msg.text }] }],
              turnComplete: true
            });
          }
        }
      } catch (err) {
        console.error("Error handling client message:", err);
      }
    });

    wsClient.on('close', () => {
      try {
        if (session) session.close();
      } catch (e) {}
    });

    try {
      // Connect to Gemini Live API
      // Docs: https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk
      session = await getAI().live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: "You are a friendly interactive storybook narrator. You speak to a 3-5 year old child. Keep stories engaging, magical, and ask the child what happens next! Use a warm, expressive voice. Start by introducing yourself and asking the child what kind of adventure they want to go on today." }]
          }
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live API session opened');
          },
          onmessage: async (serverMsg: any) => {
            try {
              const keys = Object.keys(serverMsg);
              console.log('Gemini msg keys:', keys.join(', '));
              // Forward all server messages to browser so the client can handle
              // serverContent (modelTurn, outputTranscription, inputTranscription, turnComplete)
              if (serverMsg.serverContent) {
                wsClient.send(JSON.stringify({ type: 'content', data: serverMsg }));
              }
              // setupComplete indicates session is ready
              if (serverMsg.setupComplete) {
                console.log('Gemini session setup complete');
              }
              // Forward tool calls if any
              if (serverMsg.toolCall) {
                wsClient.send(JSON.stringify({ type: 'toolCall', data: serverMsg }));
              }
            } catch (err) {
              console.error("Error processing server message:", err);
            }
          },
          onerror: (e: any) => {
            console.error("Gemini Live API error:", e?.message || e);
          },
          onclose: (e: any) => {
            console.log("Gemini closed the connection:", e?.reason || 'no reason');
            try { wsClient.close(); } catch (err) {}
          }
        }
      });
      console.log('Gemini Live API connected successfully');
      wsClient.send(JSON.stringify({ type: 'connected' }));
    } catch (error: any) {
       console.error("Error connecting to Gemini Live API:", error?.message || error);
       wsClient.close();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
