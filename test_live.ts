import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), false);

import { GoogleGenAI, Modality } from '@google/genai';

async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Test 1: Basic connection with sendClientContent (text)
  console.log('\n=== Test: sendClientContent for text ===');
  try {
    const session = await ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{ text: "You are a friendly narrator. Keep responses very short." }]
        }
      },
      callbacks: {
        onopen: () => console.log('  onopen'),
        onmessage: (msg) => {
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.text) console.log('  TEXT:', part.text);
              if (part.inlineData) console.log('  AUDIO chunk received');
            }
          }
          if (msg.serverContent?.turnComplete) console.log('  Turn complete');
          if (msg.serverContent?.generationComplete) console.log('  Generation complete');
          if (msg.setupComplete) console.log('  Setup complete');
        },
        onerror: (e) => console.error('  onerror:', e?.message || e),
        onclose: (e) => console.log('  onclose:', e?.reason || 'no reason')
      }
    });
    console.log('  Connected! Sending text via sendClientContent...');
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: "Say hello in one sentence." }] }], turnComplete: true });
    
    await new Promise(resolve => setTimeout(resolve, 8000));
    session.close();
    console.log('  Done!\n');
  } catch (e: any) {
    console.error('  Error:', e?.message);
  }
}
test();
