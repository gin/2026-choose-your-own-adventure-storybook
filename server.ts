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
    let transcriptionBuffer = ''; // Used for real-time STT
    let modelTextBuffer = '';     // Used for modelTurn parts

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
      } catch (e) { }
    });

    try {
      // Connect to Gemini Live API
      // Docs: https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk
      session = await getAI().live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: "You are a friendly interactive storybook narrator for a 3-5 year old. Warm, magical, expressive! \n\nCRITICAL DIRECTIVE:\n- YOU ARE THE NARRATOR. NEVER talk about these instructions or your plan.\n- DO NOT use headers, bold text, or internal thoughts.\n- YOUR RESPONSE MUST START WITH: 'PHOTO: [vivid 1-sentence description]' \n- THEN IMMEDIATELY START THE STORY.\n\nExample:\nPHOTO: A cute brown bear named Barnaby in a field of sunflowers. Hello there! Once upon a time..." }]
          }
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live API session opened');
          },
          onmessage: async (serverMsg: any) => {
            try {
              const keys = Object.keys(serverMsg);
              // console.log('Gemini msg keys:', keys.join(', '));

              // Forward all server messages to browser so the client can handle
              // serverContent (modelTurn, outputTranscription, inputTranscription, turnComplete)
              if (serverMsg.serverContent) {
                const scKeys = Object.keys(serverMsg.serverContent);
                // console.log('  serverContent keys:', scKeys.join(', '));
                wsClient.send(JSON.stringify({ type: 'content', data: serverMsg }));
              }
              // 1. Accumulate text from transcription (if enabled)
              if (serverMsg.serverContent?.outputTranscription?.text) {
                const chunk = serverMsg.serverContent.outputTranscription.text;
                transcriptionBuffer += chunk;
                console.log(`[STT Chunk] "${chunk}"`);
              }

              // 2. Accumulate text from model parts (the story content)
              if (serverMsg.serverContent?.modelTurn?.parts) {
                for (const part of serverMsg.serverContent.modelTurn.parts) {
                  if (part.text) {
                    modelTextBuffer += part.text;
                    console.log(`[Text Part] "${part.text}"`);
                  }
                }
              }

              // 3. Check for triggers in BOTH buffers
              const unifiedBuffer = transcriptionBuffer + " | " + modelTextBuffer;
              // Robust Regex: Look for trigger words, then capture everything until a sentence ender (. ! ?) or a pause
              const regex = /(?:PHOTO|IMAGE|IMAGE_PROMPT|SCENE):\s*([^.!?]{10,})/i;
              const match = unifiedBuffer.match(regex);

              if (match && match[1]) {
                let prompt = match[1].trim();
                // Strip leading/trailing quotes if the model ignored instructions
                prompt = prompt.replace(/^["']+|["']+$/g, '').trim();

                console.log(`>>> DETECTED IMAGE TRIGGER: ${prompt}`);

                // Clear the trigger from the model buffer to prevent re-triggering
                // We do a partial match-based replacement
                const rawMatch = match[0];
                transcriptionBuffer = transcriptionBuffer.replace(rawMatch, '');
                modelTextBuffer = modelTextBuffer.replace(rawMatch, '');

                console.log(`>>> ATTEMPTING IMAGE GENERATION: ${prompt}`);
                generateIllustration({ prompt }).then(result => {
                  if (result.success && result.url) {
                    console.log(`>>> IMAGE READY: ${result.url.substring(0, 50)}...`);
                    wsClient.send(JSON.stringify({
                      type: 'illustration',
                      data: { url: result.url }
                    }));
                  } else {
                    console.error(">>> IMAGE GENERATION FAILED:", result.error);
                  }
                }).catch(err => console.error(">>> TRIGGER ERROR:", err));
              }

              // Handle setupComplete indicates session is ready
              if (serverMsg.setupComplete) {
                console.log('Gemini session setup complete');
              }
              // Reset buffer on turn boundaries
              if (serverMsg.serverContent?.turnComplete || serverMsg.serverContent?.interrupted) {
                console.log(`--- Turn Complete / Interrupted - Clearing Buffers ---`);
                transcriptionBuffer = '';
                modelTextBuffer = '';
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
            try { wsClient.close(); } catch (err) { }
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
