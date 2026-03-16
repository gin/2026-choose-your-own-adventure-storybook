"use client";

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera, Sparkles, Wand2 } from 'lucide-react';

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const persona = searchParams.get('character') || 'capybara';

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasPlayedRef = useRef(false);

  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const ensureVideoPlaying = () => {
    const video = videoRef.current;
    if (!video || !stream || hasPhoto) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      hasPlayedRef.current = false;
      return;
    }
    if (!hasPlayedRef.current && video.readyState >= 2) {
      hasPlayedRef.current = true;
      video.play().catch(e => console.error("Video play failed:", e));
    }
  };

  const setupCamera = async () => {
    setCameraError(null);
    try {
      // Check if we are in a secure context
      if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
          setCameraError("Webcam requires a secure (HTTPS) connection to work in production.");
          return;
      }

      const newStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setStream(newStream);
    } catch (err: any) {
      console.error("Camera setup failed:", err);
      if (err.name === 'NotAllowedError') {
          setCameraError("Camera access was denied. Please check your browser's site settings.");
      } else if (err.name === 'NotFoundError') {
          setCameraError("No camera found. Please connect one and try again.");
      } else {
          setCameraError(`Camera error: ${err.message || 'Unknown error'}`);
      }
    }
  };

  useEffect(() => {
    setupCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Ensure stream is attached to video element if it re-renders or stream arrives late
  useEffect(() => {
    if (videoRef.current && stream && !hasPhoto) {
      ensureVideoPlaying();
    }
  }, [stream, hasPhoto]);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPhotoDataUrl(dataUrl);
        setHasPhoto(true);
      }
    }
  };

  const startStory = async () => {
    if (!photoDataUrl) return;
    setIsCreating(true);

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona,
          heroImageUrl: photoDataUrl
        })
      });
      const data = await res.json();

      if (data.sessionId) {
        router.push(`/story?session=${data.sessionId}`);
      }
    } catch (e) {
      console.error(e);
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-24 overflow-hidden relative">
      <div className="absolute top-10 left-10 text-6xl opacity-20">🪄</div>
      <div className="absolute bottom-10 right-10 text-6xl opacity-20">📸</div>

      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card-playful max-w-2xl w-full text-center z-10"
      >
        <h1 className="text-4xl font-extrabold text-brand-purple mb-6 flex items-center justify-center gap-3">
          <Camera className="w-10 h-10 text-brand-pink" />
          Become the hero!
        </h1>
        
        <p className="text-xl mb-6 font-medium text-gray-700">
          Let&apos;s take a picture so we can put YOU inside the story!
        </p>

        <div className="rounded-3xl overflow-hidden border-8 border-brand-yellow mx-auto w-full max-w-[400px] mb-8 relative aspect-video bg-gray-100 flex items-center justify-center">
          {cameraError ? (
            <div className="p-8 text-brand-pink font-bold text-center">
              <p className="mb-2 text-xl">⚠️ Oops!</p>
              <p className="text-sm mb-4">{cameraError}</p>
              <button 
                onClick={setupCamera}
                className="text-xs bg-brand-pink text-white px-4 py-2 rounded-full uppercase tracking-widest hover:bg-brand-purple transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : !hasPhoto ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              className="w-full h-full object-cover"
              onLoadedMetadata={() => {
                ensureVideoPlaying();
              }}
            />
          ) : (
            <img src={photoDataUrl!} alt="You!" className="w-full h-full object-cover" />
          )}
          
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {!hasPhoto ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={takePhoto}
            disabled={!!cameraError || !stream}
            className={`btn-bouncy flex items-center justify-center gap-3 w-full max-w-sm mx-auto text-2xl ${cameraError || !stream ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {stream ? 'Say Cheese! 📸' : 'Starting Camera...'}
          </motion.button>
        ) : (
          <div className="flex gap-4 max-w-md mx-auto">
            <button
               onClick={() => setHasPhoto(false)}
               className="bg-gray-200 text-gray-800 font-bold py-4 px-8 rounded-full shadow-[0_4px_0_#9ca3af] flex-1 hover:bg-gray-300 transition-colors"
            >
               Retake
            </button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              onClick={startStory}
              disabled={isCreating}
              className="btn-bouncy flex flex-1 items-center justify-center gap-2 text-2xl whitespace-nowrap"
            >
              {isCreating ? <Sparkles className="animate-spin w-8 h-8" /> : <Wand2 className="w-8 h-8 font-bold" />}
              {isCreating ? 'Making Magic...' : 'Start Story!'}
            </motion.button>
          </div>
        )}
      </motion.div>
    </main>
  );
}

export default function Onboarding() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-2xl font-bold text-brand-purple">Loading Magic...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
