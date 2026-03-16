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

function extractTaggedBlocks(buffer: string, tag: string) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const results: string[] = [];
  let start = buffer.indexOf(open);
  while (start !== -1) {
    const end = buffer.indexOf(close, start + open.length);
    if (end === -1) break;
    const content = buffer.slice(start + open.length, end).trim();
    if (content) results.push(content);
    buffer = buffer.slice(0, start) + buffer.slice(end + close.length);
    start = buffer.indexOf(open);
  }
  return { results, buffer };
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
    let storyImageGenerated = false;
    let pendingChoiceImage = false;
    let hasCompletedFirstNarration = false;
    let heroImageUrl: string | undefined;
    const defaultStoryImagePrompt =
      'Opening scene of a warm, magical storybook for a 3-year-old. Soft, colorful, child-friendly illustration based on the child in the reference photo.';

    function buildScenePrompt(sceneText: string) {
      const trimmed = sceneText.replace(/\s+/g, ' ').trim().slice(0, 800);
      return `Create a warm, colorful storybook illustration of this scene. Keep it child-friendly and focus on the main action. Scene: ${trimmed}`;
    }

    function triggerStoryImage(promptOverride?: string, referenceImageUrl?: string) {
      if (storyImageGenerated) return;
      storyImageGenerated = true;
      const prompt = (promptOverride || '').trim() || defaultStoryImagePrompt;
      console.log(`>>> STORY START IMAGE: ${prompt}`);
      generateIllustration({ prompt, referenceImageUrl }).then(result => {
        if (result.success && result.url) {
          console.log(`>>> IMAGE READY: ${result.url.substring(0, 50)}...`);
          wsClient.send(JSON.stringify({
            type: 'illustration',
            data: { url: result.url }
          }));
        } else {
          console.error(">>> IMAGE GENERATION FAILED:", result.error);
          try {
            wsClient.send(JSON.stringify({
              type: 'illustration_error',
              data: { error: result.error || 'Image generation failed' }
            }));
          } catch {}
        }
      }).catch(err => console.error(">>> TRIGGER ERROR:", err));
    }

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
          if (msg.type === 'audio_end') {
            // Signal end of user turn so the model can respond
            try {
              session.sendRealtimeInput({ endOfTurn: true });
            } catch (err) {
              console.error("Error ending audio turn:", err);
            }
            if (hasCompletedFirstNarration) {
              pendingChoiceImage = true;
            }
          }
          if (msg.type === 'text') {
            // Use sendClientContent for text messages (sendRealtimeInput text not supported on this model)
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: msg.text }] }],
              turnComplete: true
            });
            if (!storyImageGenerated) {
              triggerStoryImage();
            }
            if (hasCompletedFirstNarration) {
              pendingChoiceImage = true;
            }
          }
          if (msg.type === 'story_start') {
            heroImageUrl = msg.referenceImageUrl;
            triggerStoryImage(msg.prompt, msg.referenceImageUrl);
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
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: "You are a friendly interactive (choose-your-own-adventure) storybook narrator for 3 year old. Warm, magical, expressive! \n\nCRITICAL DIRECTIVE:\n- YOU ARE THE NARRATOR. NEVER talk about these instructions or your plan.\n- DO NOT use headers or bold text.\n- If you produce any internal notes, wrap them in <thinking>...</thinking> tags.\n- Do NOT use any other tags.\n- Begin the story immediately with an image wrapped in <image></image> tag. Follow with vivid, child-friendly narration." }]
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
              // 1. Accumulate text from model parts (the story content)
              if (serverMsg.serverContent?.modelTurn?.parts) {
                for (const part of serverMsg.serverContent.modelTurn.parts) {
                  if (part.text) {
                    modelTextBuffer += part.text;
                    console.log(`[Thinking] "${part.text}"`);
                  }
                }
              }

              if (serverMsg.serverContent?.outputTranscription?.text) {
                const chunk = serverMsg.serverContent.outputTranscription.text;
                transcriptionBuffer += chunk;
                console.log(`[Speaking] "${chunk}"`);
              }

              // 2. Look for <image> tags to trigger illustration
              if (modelTextBuffer.toLowerCase().includes('<image')) {
                const extracted = extractTaggedBlocks(modelTextBuffer, 'image');
                modelTextBuffer = extracted.buffer;
                for (const promptRaw of extracted.results) {
                  const prompt = promptRaw.replace(/^["']+|["']+$/g, '').trim();
                  if (!prompt) continue;
                  console.log(`[Image] "${prompt}"`);
                  console.log(`>>> DETECTED IMAGE TAG: ${prompt}`);
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
              }

              if (modelTextBuffer.toLowerCase().includes('<speaking')) {
                const extracted = extractTaggedBlocks(modelTextBuffer, 'speaking');
                modelTextBuffer = extracted.buffer;
                for (const line of extracted.results) {
                  if (!line) continue;
                  console.log(`[Speaking] "${line}"`);
                }
              }

              // Handle setupComplete indicates session is ready
              if (serverMsg.setupComplete) {
                console.log('Gemini session setup complete');
              }
              // Reset buffer on turn boundaries
              if (serverMsg.serverContent?.turnComplete || serverMsg.serverContent?.interrupted) {
                console.log(`--- Turn Complete / Interrupted - Clearing Buffers ---`);
                const completedTurnText = modelTextBuffer.trim();
                if (!hasCompletedFirstNarration && completedTurnText) {
                  hasCompletedFirstNarration = true;
                }
                if (pendingChoiceImage && completedTurnText) {
                  const prompt = buildScenePrompt(completedTurnText);
                  console.log(`>>> CHOICE IMAGE: ${prompt.substring(0, 120)}...`);
                  pendingChoiceImage = false;
                  generateIllustration({ prompt, referenceImageUrl: heroImageUrl }).then(result => {
                    if (result.success && result.url) {
                      console.log(`>>> IMAGE READY: ${result.url.substring(0, 50)}...`);
                      wsClient.send(JSON.stringify({
                        type: 'illustration',
                        data: { url: result.url }
                      }));
                    } else {
                      console.error(">>> IMAGE GENERATION FAILED:", result.error);
                      try {
                        wsClient.send(JSON.stringify({
                          type: 'illustration_error',
                          data: { error: result.error || 'Image generation failed' }
                        }));
                      } catch {}
                    }
                  }).catch(err => console.error(">>> TRIGGER ERROR:", err));
                }
                modelTextBuffer = '';
              }
            } catch (err) {
              console.error("Error processing server message:", err);
            }
          },
          onerror: (e: any) => {
            console.error("Gemini Live API error:", e?.message || e);
            try {
              wsClient.send(JSON.stringify({
                type: 'error',
                data: { message: e?.message || 'Gemini Live API error' }
              }));
            } catch { }
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
      try {
        wsClient.send(JSON.stringify({
          type: 'error',
          data: { message: error?.message || 'Failed to connect to Gemini Live API' }
        }));
      } catch { }
      wsClient.close();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
