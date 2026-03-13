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
  const [storyText, setStoryText] = useState("Waiting for the story to begin...");
  const [spokenText, setSpokenText] = useState("");
  const [illustration, setIllustration] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const spokenTextEndRef = useRef<HTMLDivElement | null>(null);
  const fullSpokenTextRef = useRef("");

  function addDebug(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog((prev) => [`[${timestamp}] ${msg}`, ...prev].slice(0, 50));
  }

  // Auto-scroll "What I'm Saying" to show newest text
  useEffect(() => {
    spokenTextEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [spokenText]);

  useEffect(() => {
    // Determine dynamic WebSocket URL based on host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live`;
    
    addDebug(`Connecting to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      addDebug('WebSocket to proxy: OPEN');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        addDebug(`Received: ${msg.type}`);
        if (msg.type === 'connected') {
           setIsConnected(true);
           addDebug('Gemini Live API ready! Sending initial greeting...');
           ws.send(JSON.stringify({ type: 'text', text: "Hello! I am ready for my story." }));
        } else if (msg.type === 'illustration') {
           setIllustration(msg.data.url);
           addDebug('Got illustration URL');
        } else if (msg.type === 'content') {
           const serverContent = msg.data?.serverContent;
           // Log all keys present in serverContent for debugging
           if (serverContent) {
              addDebug(`serverContent keys: ${Object.keys(serverContent).join(', ')}`);
           }
            if (serverContent && serverContent.modelTurn) {
               const parts = serverContent.modelTurn.parts;
               for (const part of parts) {
                  if (part.text) {
                     // Clear placeholder on first text
                     setStoryText((prev) => {
                        let newText = part.text
                           .replace(/(?:PHOTO|IMAGE|IMAGE_PROMPT|SCENE):\s*([^.\n!?,]*)/gi, '')
                           .replace(/\*\*.*?\*\*/g, '') // Remove markdown bold headers
                           .replace(/#{1,6}\s.*/g, '')  // Remove markdown headers
                           .trim();
                        
                        if (!newText) return prev;
                        if (prev === "Waiting for the story to begin...") return newText;
                        return prev + " " + newText;
                     });
                     addDebug(`Text: "${part.text.substring(0, 40)}..."`);
                  }
                  if (part.inlineData && part.inlineData.data) {
                     addDebug(`Audio chunk received (${part.inlineData.data.length} chars)`);
                     playPcmData(part.inlineData.data);
                  }
               }
            }

             // Handle input audio transcription (what the USER is saying)
             if (serverContent?.inputTranscription?.text) {
                const chunk = serverContent.inputTranscription.text;
                fullSpokenTextRef.current += chunk;
                setSpokenText(fullSpokenTextRef.current);
                addDebug(`User spoken chunk: "${chunk.substring(0, 20)}"`);
             }

             // Handle output audio transcription (if enabled)
             if (serverContent?.outputTranscription?.text) {
                const chunk = serverContent.outputTranscription.text;
                // fullSpokenTextRef.current += chunk; // This line is now for user input only
                addDebug(`Spoken chunk: "${chunk.substring(0, 20)}"`);
             }

             // Update the display text based on the full buffer (filtering out triggers)
             if (serverContent?.modelTurn || serverContent?.outputTranscription) {
                // 1. Strip complete tags (all formats)
                let display = fullSpokenTextRef.current
                   .replace(/(?:PHOTO|IMAGE|IMAGE_PROMPT|SCENE):\s*([^.\n!?,]*)/gi, '')
                   .replace(/\[\[IMAGE:.*?\]\]/gi, '');

                // 2. Hide partial tags at the end
                display = display.replace(/(?:PHOTO|IMAGE|IMAGE_PROMPT|SCENE):\s*.*$/i, '');
                display = display.replace(/\[\[[^\]]*$/, '');
                
                setSpokenText(display);
             }
           // Handle interrupted turns
           if (serverContent?.interrupted) {
              addDebug('Model turn was interrupted by user');
              fullSpokenTextRef.current += '\n[interrupted]\n';
              setSpokenText((prev) => prev + '\n[interrupted]\n');
           }
           if (serverContent?.turnComplete) {
              addDebug('Turn complete');
              fullSpokenTextRef.current = ""; // Reset buffer for next turn
              setSpokenText((prev) => prev + '\n\n');
           }
        }
      } catch (err) {
          addDebug(`Parse error: ${err}`);
      }
    };

    ws.onerror = (e) => {
      addDebug(`WebSocket error: ${JSON.stringify(e)}`);
    };

    ws.onclose = (e) => {
      addDebug(`WebSocket closed: code=${e.code} reason=${e.reason}`);
      setIsConnected(false);
    };

    return () => {
      ws.close();
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
      
      await recordingContextRef.current.audioWorklet.addModule('/audio-processor.js');
      const processor = new AudioWorkletNode(recordingContextRef.current, 'audio-processor');
      
      processor.port.onmessage = (event) => {
        const pcm16 = new Int16Array(event.data);
        const uint8 = new Uint8Array(pcm16.buffer);
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
  };

  return (
    <main className="min-h-screen bg-brand-background flex flex-col items-center justify-start p-4 sm:p-8">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-brand-purple flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-brand-yellow" />
          Magic Storybook
        </h1>
        <div className={`px-4 py-2 rounded-full font-bold text-white ${isConnected ? 'bg-brand-green' : 'bg-gray-400'}`}>
           {isConnected ? 'Connected!' : 'Connecting...'}
        </div>
      </header>
      
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
        {/* Visual / Illustration Area */}
        <div className="card-playful flex flex-col bg-white overflow-hidden relative min-h-[400px]">
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

        {/* Text and Interaction Area */}
        <div className="flex flex-col gap-6">
           {/* What I'm Thinking box (THE STORY) */}
           <div className="card-playful flex-1 flex flex-col">
              <h2 className="text-2xl font-bold text-brand-pink mb-4">🧠 The Story So Far...</h2>
              <div className="flex-1 overflow-y-auto">
                 <p className="text-xl font-medium text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {storyText}
                 </p>
                 <div ref={spokenTextEndRef} className="h-4" />
              </div>
           </div>

           {/* What I'm Saying box (USER INPUT) */}
           <div className="card-playful flex flex-col max-h-48">
              <h2 className="text-xl font-bold text-brand-blue mb-2">💬 My Choices</h2>
              <div className="overflow-y-auto">
                 <p className="text-md font-medium text-gray-500 leading-relaxed italic">
                    {spokenText || "Ready to listen to you..."}
                 </p>
              </div>
           </div>

           <div className="card-playful py-6 flex flex-col items-center justify-center bg-blue-50">
              <p className="font-bold text-lg mb-4 text-center text-brand-blue">
                 {isRecording ? "I am listening to you! Tell me what to do next!" : "Tap the mic when you want to interrupt or make a choice!"}
              </p>
              <div className="flex items-center gap-4">
                <motion.button 
                   whileHover={{ scale: 1.1 }}
                   whileTap={{ scale: 0.9 }}
                   onClick={isRecording ? stopRecording : startRecording}
                   className={`p-8 rounded-full shadow-lg ${isRecording ? 'bg-brand-pink animate-pulse' : 'bg-brand-blue'} text-white transition-colors`}
                >
                   {isRecording ? <MicOff className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
                </motion.button>

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
    </main>
  );
}
