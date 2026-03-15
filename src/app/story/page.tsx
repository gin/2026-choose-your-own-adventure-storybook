/* eslint-disable */
// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Image as ImageIcon, Sparkles, Bug, ChevronDown, ChevronUp } from 'lucide-react';

export default function StoryBook() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [thinkingText, setThinkingText] = useState("Waiting for the story to begin...");
  const [narrationText, setNarrationText] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [connectionMessage, setConnectionMessage] = useState<string>('Connecting...');
  const [illustration, setIllustration] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const workletReadyRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const narrationEndRef = useRef<HTMLDivElement | null>(null);
  const fullNarrationTextRef = useRef("");
  const fullUserTextRef = useRef("");
  const outputTranscriptSeenRef = useRef(false);
  const taggedBufferRef = useRef("");
  const lastSpeakingRef = useRef("");
  const lastThinkingRef = useRef("");
  const rawThinkingRef = useRef("");
  const hasThinkingTagsRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micChunkCountRef = useRef(0);

  function addDebug(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog((prev) => [`[${timestamp}] ${msg}`, ...prev].slice(0, 50));
  }

  function stopPlayback() {
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    nextStartTimeRef.current = 0;
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function armSilenceTimer() {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (isRecording) {
        addDebug('Silence detected. Ending audio turn.');
        stopRecording();
      }
    }, 1200);
  }

  function extractTaggedBlocks(buffer: string, tag: string) {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'i');
    const closeRe = new RegExp(`</${tag}>`, 'i');
    const results: string[] = [];
    let openMatch = buffer.match(openRe);
    while (openMatch && openMatch.index !== undefined) {
      const start = openMatch.index;
      const openLen = openMatch[0].length;
      const afterOpen = start + openLen;
      const closeMatch = buffer.slice(afterOpen).match(closeRe);
      if (!closeMatch || closeMatch.index === undefined) break;
      const end = afterOpen + closeMatch.index;
      const content = buffer.slice(afterOpen, end).trim();
      if (content) results.push(content);
      const closeLen = closeMatch[0].length;
      buffer = buffer.slice(0, start) + buffer.slice(end + closeLen);
      openMatch = buffer.match(openRe);
    }
    return { results, buffer };
  }

  function extractTaggedPartial(buffer: string, tag: string) {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'i');
    const openMatch = buffer.match(openRe);
    if (!openMatch || openMatch.index === undefined) return '';
    const start = openMatch.index;
    const openLen = openMatch[0].length;
    return buffer.slice(start + openLen).trim();
  }

  // Auto-scroll narration to show newest text
  useEffect(() => {
    narrationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [narrationText]);

  useEffect(() => {
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
      stopPlayback();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;

      addDebug(`Connecting to ${wsUrl}...`);
      setConnectionStatus('connecting');
      setConnectionMessage('Connecting...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        addDebug('WebSocket to proxy: OPEN');
        setConnectionStatus('connecting');
        setConnectionMessage('Proxy connected. Waiting for AI...');
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          addDebug(`Received: ${msg.type}`);
          if (msg.type === 'connected') {
             setIsConnected(true);
             setConnectionStatus('connected');
             setConnectionMessage('Connected!');
             retryCount = 0;
             addDebug('Gemini Live API ready! Sending initial greeting...');
             ws.send(JSON.stringify({ type: 'text', text: "Hello! I am ready for my story." }));
          } else if (msg.type === 'error') {
             setIsConnected(false);
             setConnectionStatus('error');
             setConnectionMessage(msg.data?.message || 'Connection error');
             addDebug(`Server error: ${msg.data?.message || 'unknown'}`);
          } else if (msg.type === 'illustration') {
             setIllustration(msg.data.url);
             addDebug('Got illustration URL');
          } else if (msg.type === 'content') {
             const serverContent = msg.data?.serverContent;
             if (serverContent) {
                addDebug(`serverContent keys: ${Object.keys(serverContent).join(', ')}`);
             }
              if (serverContent && serverContent.modelTurn) {
                 const parts = serverContent.modelTurn.parts;
                 for (const part of parts) {
                    if (part.text) {
                       rawThinkingRef.current += part.text;
                       if (!hasThinkingTagsRef.current) {
                         setThinkingText(rawThinkingRef.current.trim());
                       }
                       taggedBufferRef.current += part.text;

                       const speaking = extractTaggedBlocks(taggedBufferRef.current, 'speaking');
                       taggedBufferRef.current = speaking.buffer;
                       if (speaking.results.length) {
                         lastSpeakingRef.current += speaking.results.join(' ');
                         setNarrationText(lastSpeakingRef.current.trim());
                       } else {
                         const partialSpeaking = extractTaggedPartial(taggedBufferRef.current, 'speaking');
                         if (partialSpeaking) {
                           setNarrationText((lastSpeakingRef.current + ' ' + partialSpeaking).trim());
                         }
                       }

                       const thinking = extractTaggedBlocks(taggedBufferRef.current, 'thinking');
                       taggedBufferRef.current = thinking.buffer;
                       if (thinking.results.length) {
                         hasThinkingTagsRef.current = true;
                         lastThinkingRef.current += thinking.results.join(' ');
                         setThinkingText(lastThinkingRef.current.trim());
                       }

                       addDebug(`Text: "${part.text.substring(0, 40)}..."`);
                    }
                    if (part.inlineData && part.inlineData.data) {
                       addDebug(`Audio chunk received (${part.inlineData.data.length} chars)`);
                       playPcmData(part.inlineData.data);
                    }
                 }
              }

               if (serverContent?.outputTranscription?.text) {
                  const chunk = serverContent.outputTranscription.text;
                  fullNarrationTextRef.current += chunk;
                  const thinkingInSpeech = extractTaggedBlocks(fullNarrationTextRef.current, 'thinking');
                  if (thinkingInSpeech.results.length) {
                    lastThinkingRef.current += thinkingInSpeech.results.join(' ');
                    setThinkingText(lastThinkingRef.current.trim());
                  }
                  fullNarrationTextRef.current = thinkingInSpeech.buffer;
                  const cleaned = fullNarrationTextRef.current
                    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                    .replace(/<image>[\s\S]*?<\/image>/gi, '')
                    .replace(/<speaking>|<\/speaking>/gi, '')
                    .trim();
                  setNarrationText(cleaned);
                  addDebug(`Speaking chunk: "${chunk.substring(0, 20)}"`);
               }

               if (serverContent?.inputTranscription?.text) {
                  const chunk = serverContent.inputTranscription.text;
                  fullUserTextRef.current += chunk;
                  armSilenceTimer();
                  let display = fullUserTextRef.current
                     .replace(/(?:PHOTO|IMAGE|IMAGE_PROMPT|SCENE):\s*([^.\n!?,]*)/gi, '')
                     .replace(/\[\[IMAGE:.*?\]\]/gi, '');

                  display = display.replace(/(?:PHOTO|IMAGE|IMAGE_PROMPT|SCENE):\s*.*$/i, '');
                  display = display.replace(/\[\[[^\]]*$/, '');
                  
                  addDebug(`User spoken chunk: "${chunk.substring(0, 20)}"`);
               }

             if (serverContent?.interrupted) {
                addDebug('Model turn was interrupted by user');
             }
             if (serverContent?.turnComplete) {
                addDebug('Turn complete');
                fullNarrationTextRef.current = "";
                fullUserTextRef.current = "";
                outputTranscriptSeenRef.current = false;
                taggedBufferRef.current = "";
                rawThinkingRef.current = "";
                hasThinkingTagsRef.current = false;
             }
          }
        } catch (err) {
            addDebug(`Parse error: ${err}`);
        }
      };

      ws.onerror = (e) => {
        addDebug(`WebSocket error: ${JSON.stringify(e)}`);
        setConnectionStatus('error');
        setConnectionMessage('WebSocket error. Check server logs.');
      };

      ws.onclose = (e) => {
        addDebug(`WebSocket closed: code=${e.code} reason=${e.reason}`);
        setIsConnected(false);
        stopPlayback();

        if (retryCount < 3) {
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
          retryCount += 1;
          setConnectionStatus('connecting');
          setConnectionMessage(`Reconnecting (${retryCount}/3)...`);
          retryTimer = setTimeout(() => {
            connect();
          }, backoffMs);
          return;
        }

        setConnectionStatus('error');
        setConnectionMessage(e.reason ? `Disconnected: ${e.reason}` : `Disconnected (code ${e.code})`);
      };
    };

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (wsRef.current) wsRef.current.close();
      stopPlayback();
      stopRecording();
    };
  }, []);

  async function playPcmData(base64Audio: string) {
    if (!audioContextRef.current) {
       audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
       nextStartTimeRef.current = audioContextRef.current.currentTime;
    }
    if (audioContextRef.current.state === 'suspended') {
       await audioContextRef.current.resume();
    }
    const binaryString = window.atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
    }

    const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);

    const currentTime = audioContextRef.current.currentTime;
    if (nextStartTimeRef.current < currentTime) {
       nextStartTimeRef.current = currentTime;
    }
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  const startRecording = async () => {
    try {
      // Use a separate AudioContext for recording at 16kHz (playback uses 24kHz)
      if (!recordingContextRef.current) {
        recordingContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (recordingContextRef.current.state === 'suspended') {
        await recordingContextRef.current.resume();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const source = recordingContextRef.current.createMediaStreamSource(stream);
      
      if (!workletReadyRef.current) {
        await recordingContextRef.current.audioWorklet.addModule('/audio-processor.js');
        workletReadyRef.current = true;
        addDebug('Audio worklet module loaded');
      }
      const processor = new AudioWorkletNode(recordingContextRef.current, 'audio-processor');
      processor.onprocessorerror = (err) => {
        addDebug(`AudioWorklet error: ${err}`);
      };
      
      processor.port.onmessage = (event) => {
        const pcm16 = new Int16Array(event.data);
        const uint8 = new Uint8Array(pcm16.buffer);
        if (uint8.byteLength > 0) {
          micChunkCountRef.current += 1;
          if (micChunkCountRef.current % 20 === 0) {
            console.log(`[Mic] chunk bytes=${uint8.byteLength}`);
          }
        }
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8.byteLength; i += chunkSize) {
           binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSize)));
        }
        const base64 = window.btoa(binary);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };

      source.connect(processor);
      processor.connect(recordingContextRef.current.destination);
      processorRef.current = processor;
      setIsRecording(true);
      addDebug('Microphone recording started');
    } catch (err) {
      console.error("Mic error:", err);
      addDebug(`Mic error: ${err}`);
    }
  };

  function stopRecording() {
    if (processorRef.current) {
       processorRef.current.disconnect();
       processorRef.current = null;
    }
    if (mediaStreamRef.current) {
       mediaStreamRef.current.getTracks().forEach((t: any) => t.stop());
       mediaStreamRef.current = null;
    }
    setIsRecording(false);
    addDebug('Microphone recording stopped');
    clearSilenceTimer();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
       wsRef.current.send(JSON.stringify({ type: 'audio_end' }));
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-start p-4 sm:p-8 relative book-shell">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-brand-purple flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-brand-yellow" />
          Magic Storybook
        </h1>
        <div className={`px-4 py-2 rounded-full font-bold text-white ${
          connectionStatus === 'connected'
            ? 'bg-brand-green'
            : connectionStatus === 'error'
            ? 'bg-brand-pink'
            : 'bg-gray-400'
        }`}>
           {connectionMessage}
        </div>
      </header>
      
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 pb-28 items-stretch book-spread">
        {/* Visual / Illustration Area */}
        <div className="card-playful book-page flex flex-col overflow-hidden relative min-h-[400px]">
           {illustration ? (
             <motion.img 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                src={illustration} 
                alt="Story Illustration" 
                className="w-full h-full object-cover rounded-2xl absolute inset-0"
             />
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                <ImageIcon className="w-24 h-24 mb-4 text-gray-300" />
                <p className="text-xl font-bold">Waiting for the magic picture to appear...</p>
             </div>
           )}
        </div>

        {/* Text Area */}
        <div className="flex flex-col gap-6 h-full">
           {/* What I'm Saying box (NARRATION) */}
           <div className="card-playful book-page flex flex-col flex-1">
              <h2 className="text-xl font-bold text-brand-blue mb-2">💬 What I am saying</h2>
              <div className="overflow-y-auto">
                 <p className="text-xl font-semibold text-gray-700 leading-relaxed">
                    {narrationText || "Waiting for narration..."}
                 </p>
                 <div ref={narrationEndRef} className="h-4" />
              </div>
           </div>

           {/* Debug Accordion */}
           <AnimatePresence>
             {debugOpen && (
               <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
               >
                 <div className="card-playful flex flex-col mb-4">
                   <h2 className="text-xl font-bold text-brand-pink mb-2">🧠 What I am thinking (debug)</h2>
                   <div className="max-h-60 overflow-y-auto">
                     <p className="text-md font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">
                       {thinkingText}
                     </p>
                   </div>
                 </div>
                 <div className="card-playful bg-gray-900 text-green-400 p-4 rounded-2xl max-h-60 overflow-y-auto font-mono text-xs">
                   <div className="flex justify-between items-center mb-2">
                     <span className="font-bold text-white text-sm">🐛 Debug Log</span>
                     <button onClick={() => setDebugLog([])} className="text-gray-500 hover:text-white text-xs">Clear</button>
                   </div>
                   {debugLog.length === 0 ? (
                     <p className="text-gray-500">No events yet...</p>
                   ) : (
                     debugLog.map((line, i) => (
                       <div key={i} className="py-0.5 border-b border-gray-800">{line}</div>
                     ))
                   )}
                 </div>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-6 flex items-center justify-center pointer-events-none">
        <motion.button
           whileHover={{ scale: 1.1 }}
           whileTap={{ scale: 0.9 }}
           onClick={isRecording ? stopRecording : startRecording}
           className={`pointer-events-auto p-8 rounded-full shadow-lg ${isRecording ? 'bg-brand-pink animate-pulse' : 'bg-brand-blue'} text-white transition-colors`}
        >
           {isRecording ? <MicOff className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
        </motion.button>
      </div>

      <div className="fixed bottom-6 right-6">
        <motion.button
           whileHover={{ scale: 1.05 }}
           whileTap={{ scale: 0.95 }}
           onClick={() => setDebugOpen(!debugOpen)}
           className="p-4 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
           title="Toggle debug log"
        >
           <Bug className="w-6 h-6" />
           {debugOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </motion.button>
      </div>
    </main>
  );
}
