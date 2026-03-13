"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera, Sparkles, Wand2 } from 'lucide-react';

export default function Onboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const persona = searchParams.get('character') || 'capybara';

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // Request webcam access
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error("Camera error:", err);
      });

    return () => {
      // Cleanup camera stream
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
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
          {!hasPhoto ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
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
            className="btn-bouncy flex items-center justify-center gap-3 w-full max-w-sm mx-auto text-2xl"
          >
            Say Cheese! 📸
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
