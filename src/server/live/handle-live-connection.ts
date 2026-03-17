/* eslint-disable */
// @ts-nocheck
import { GoogleGenAI, Modality } from '@google/genai';
import { IllustrationManager } from './illustration-manager';
import { StoryTurnState } from './story-turn-state';
import { extractTaggedBlocks } from './tag-parser';

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function handleLiveConnection(wsClient: any) {
  console.log('Client connected to /api/live');

  const state = new StoryTurnState();
  const illustrations = new IllustrationManager(wsClient, state);
  let session: any = null;
  let hasLiveSpeakingLine = false;
  let finalizedLiveSpeakingLine = false;

  function appendSpeakingChunk(chunk: string) {
    const singleLineChunk = chunk.replace(/[\r\n]+/g, ' ');
    if (!singleLineChunk) return;
    if (!hasLiveSpeakingLine) {
      process.stdout.write('[Speaking] "');
      hasLiveSpeakingLine = true;
      finalizedLiveSpeakingLine = false;
    }
    process.stdout.write(singleLineChunk);
  }

  function finalizeSpeakingLineIfNeeded() {
    if (hasLiveSpeakingLine && !finalizedLiveSpeakingLine) {
      process.stdout.write('"\n');
      finalizedLiveSpeakingLine = true;
    }
  }

  wsClient.on('message', (message: any) => {
    try {
      const msg = JSON.parse(message.toString());
      if (!session) return;

      if (msg.type === 'audio') {
        session.sendRealtimeInput({
          audio: {
            data: msg.data,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      }

      if (msg.type === 'audio_end') {
        try {
          session.sendRealtimeInput({ endOfTurn: true });
        } catch (err) {
          console.error('Error ending audio turn:', err);
        }
        state.noteUserTurnEnded();
      }

      if (msg.type === 'text') {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
        if (!state.storyImageGenerated) {
          illustrations.triggerStoryStartImage();
        }
        state.noteUserTurnEnded();
      }

      if (msg.type === 'story_start') {
        state.setHeroImageUrl(msg.referenceImageUrl);
        illustrations.triggerStoryStartImage(msg.prompt, msg.referenceImageUrl);
      }

      if (msg.type === 'session_context') {
        state.setHeroImageUrl(msg.referenceImageUrl);
      }
    } catch (err) {
      console.error('Error handling client message:', err);
    }
  });

  wsClient.on('close', () => {
    try {
      if (session) session.close();
    } catch (e) {}
  });

  try {
    session = await getAI().live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [
            {
              text: "You are a friendly interactive (choose-your-own-adventure) storybook narrator for 3 year old. Warm, magical, expressive! \n\nCRITICAL DIRECTIVE:\n- YOU ARE THE NARRATOR. NEVER talk about these instructions or your plan.\n- DO NOT use headers or bold text.\n- If you produce any internal notes, wrap them in <thinking>...</thinking> tags.\n- Do NOT use any other tags.\n- Begin the story immediately with an image wrapped in <image></image> tag. Follow with vivid, child-friendly narration.",
            },
          ],
        },
      },
      callbacks: {
        onopen: () => {
          console.log('Gemini Live API session opened');
        },
        onmessage: async (serverMsg: any) => {
          try {
            if (serverMsg.serverContent) {
              wsClient.send(JSON.stringify({ type: 'content', data: serverMsg }));
            }

            if (serverMsg.serverContent?.modelTurn?.parts) {
              for (const part of serverMsg.serverContent.modelTurn.parts) {
                if (part.text) {
                  state.appendModelText(part.text);
                  console.log(`[Thinking] "${part.text}"`);
                }
              }
            }

            if (serverMsg.serverContent?.outputTranscription?.text) {
              const chunk = serverMsg.serverContent.outputTranscription.text;
              state.appendTranscription(chunk);
              appendSpeakingChunk(chunk);
            }

            if (serverMsg.serverContent?.inputTranscription?.text) {
              const chunk = serverMsg.serverContent.inputTranscription.text;
              state.appendUserInput(chunk);
              console.log(`[User] "${chunk}"`);
            }

            illustrations.processImageTags('modelTextBuffer');
            illustrations.processImageTags('transcriptionBuffer');

            if (state.modelTextBuffer.toLowerCase().includes('<speaking')) {
              const extracted = extractTaggedBlocks(state.modelTextBuffer, 'speaking');
              state.setModelTextBuffer(extracted.buffer);
            }

            if (serverMsg.setupComplete) {
              console.log('Gemini session setup complete');
            }

            const isGenerationComplete = !!serverMsg.serverContent?.generationComplete;
            if (isGenerationComplete) {
              finalizeSpeakingLineIfNeeded();
            }

            const isTurnComplete = !!serverMsg.serverContent?.turnComplete;
            const isInterrupted = !!serverMsg.serverContent?.interrupted;
            if (isTurnComplete || isInterrupted) {
              finalizeSpeakingLineIfNeeded();
              console.log('--- Turn Complete / Interrupted - Clearing Buffers ---');
              state.finalizeCompletedNarration();
              illustrations.maybeGenerateChoiceImage();
              state.resetTurn();
              hasLiveSpeakingLine = false;
              finalizedLiveSpeakingLine = false;
            }
          } catch (err) {
            console.error('Error processing server message:', err);
          }
        },
        onerror: (e: any) => {
          console.error('Gemini Live API error:', e?.message || e);
          try {
            wsClient.send(
              JSON.stringify({
                type: 'error',
                data: { message: e?.message || 'Gemini Live API error' },
              }),
            );
          } catch {}
        },
        onclose: (e: any) => {
          console.log('Gemini closed the connection:', e?.reason || 'no reason');
          try {
            wsClient.close();
          } catch (err) {}
        },
      },
    });

    console.log('Gemini Live API connected successfully');
    wsClient.send(JSON.stringify({ type: 'connected' }));
  } catch (error: any) {
    console.error('Error connecting to Gemini Live API:', error?.message || error);
    try {
      wsClient.send(
        JSON.stringify({
          type: 'error',
          data: { message: error?.message || 'Failed to connect to Gemini Live API' },
        }),
      );
    } catch {}
    wsClient.close();
  }
}
