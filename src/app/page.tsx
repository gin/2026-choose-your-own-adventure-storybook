"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Camera, ArrowRight } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [persona, setPersona] = useState<string | null>(null);

  const characters = [
    { id: 'capybara', name: 'Friendly Capybara', emoji: '🐹', color: 'bg-brand-yellow' },
    { id: 'owl', name: 'Wise Owl', emoji: '🦉', color: 'bg-brand-purple' },
    { id: 'frog', name: 'Leaping Frog', emoji: '🐸', color: 'bg-brand-green' },
    { id: 'turtle', name: 'Tiny Turtle', emoji: '🐢', color: 'bg-brand-blue' },
  ];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-24 overflow-hidden relative">
      {/* Background decorations */}
      <div className="absolute top-10 left-10 text-6xl opacity-20">☁️</div>
      <div className="absolute bottom-10 right-10 text-6xl opacity-20">☁️</div>
      <div className="absolute top-40 right-20 text-6xl opacity-20 text-brand-yellow">✨</div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.6 }}
        className="text-center z-10"
      >
        <h1 className="text-5xl md:text-7xl font-extrabold text-brand-purple drop-shadow-md mb-4 flex items-center justify-center gap-4">
          <Sparkles className="text-brand-yellow w-12 h-12" />
          Magic Storybook
          <Sparkles className="text-brand-yellow w-12 h-12" />
        </h1>
        <p className="text-xl md:text-2xl text-brand-pink font-bold mb-12">
          Starring YOU!
        </p>

        <div className="card-playful max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Who will read your story?</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {characters.map((char) => (
              <motion.button
                key={char.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPersona(char.id)}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-4 transition-all ${
                  persona === char.id 
                    ? `border-brand-pink ${char.color} text-white shadow-lg scale-110` 
                    : 'border-transparent bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <span className="text-5xl mb-2">{char.emoji}</span>
                <span className="font-bold text-sm">{char.name}</span>
              </motion.button>
            ))}
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          disabled={!persona}
          onClick={() => router.push(`/onboarding?character=${persona}`)}
          className={`btn-bouncy flex items-center justify-center gap-3 w-full max-w-sm mx-auto text-2xl ${
            !persona ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Let&apos;s Go! <ArrowRight className="w-8 h-8 font-bold" />
        </motion.button>

      </motion.div>
    </main>
  );
}
