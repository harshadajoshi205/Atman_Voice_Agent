/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { Phone, PhoneOff, Activity, MessageSquare, Sparkles, Volume2, Mic, ClipboardList, CheckCircle2, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioStreamer, SYSTEM_INSTRUCTION } from './services/liveService';
import { Dashboard } from './components/Dashboard';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [status, setStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [volume, setVolume] = useState(0);
  const [activeTab, setActiveTab] = useState<'agent' | 'dashboard'>('agent');
  const [error, setError] = useState<string | null>(null);

  // Dashboard data
  const [logs, setLogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<{ role: 'user' | 'model', text: string }[]>([]);
  const isStoppingRef = useRef(false); // Prevent double-stop loop

  // Keep transcriptRef in sync with state for backend processing
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [logsRes, leadsRes] = await Promise.all([
        fetch('/api/dashboard/logs'),
        fetch('/api/leads')
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  const resetSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    // Only set a new timeout if session is active
    if (sessionRef.current) {
      silenceTimeoutRef.current = setTimeout(() => {
        console.log("Silence timeout reached, stopping session.");
        stopSession();
      }, 45000);
    }
  }, []);

  const stopSession = useCallback(async () => {
    // Prevent re-entrant calls (onclose -> stopSession -> close -> onclose loop)
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    audioStreamerRef.current?.stop();

    try {
      sessionRef.current?.close();
    } catch (e) {
      console.warn("Error closing session:", e);
    }
    sessionRef.current = null;

    // Process transcript if it exists
    if (transcriptRef.current.length > 0) {
      processCallTranscript(transcriptRef.current);
    }

    setIsConnected(false);
    setIsConnecting(false);
    setStatus('idle');

    // Allow future stop calls after a short delay
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 500);
  }, []);

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
    setTranscript([]);
    isStoppingRef.current = false;

    try {
      const apiKey = (process.env as any).GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing. Set it in your environment variables.');
      }

      const ai = new GoogleGenAI({ apiKey });

      // Create audio streamer first but don't start mic yet
      audioStreamerRef.current = new AudioStreamer((base64Data) => {
        if (sessionRef.current) {
          try {
            sessionRef.current.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          } catch (e) {
            console.warn("Error sending audio data:", e);
          }
        }
      });
      audioStreamerRef.current.setVolumeCallback((v) => setVolume(v));

      // Start microphone BEFORE connecting to avoid AudioContext race condition
      console.log("Starting microphone...");
      await audioStreamerRef.current.start();
      console.log("Microphone started successfully.");

      console.log("Connecting to Gemini Live API...");
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-preview-native-audio-dialog",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        },
        callbacks: {
          onopen: () => {
            console.log("Connected to Gemini Live API successfully!");
            setIsConnected(true);
            setIsConnecting(false);
            setStatus('listening');
            resetSilenceTimeout();
          },
          onmessage: async (message: LiveServerMessage) => {
            const msg = message as any;

            // 1. Tool Calls
            if (msg.toolCall) {
              const call = msg.toolCall.functionCalls?.find((f: any) => f.name === "hangUp");
              if (call) {
                stopSession();
                return;
              }
            }

            // 2. Audio Output
            const modelParts = msg.serverContent?.modelTurn?.parts || [];
            for (const part of modelParts) {
              if (part.inlineData?.data) {
                setStatus('speaking');
                audioStreamerRef.current?.playAudioChunk(part.inlineData.data);
                resetSilenceTimeout();
              }
            }

            // 3. Interruption
            if (msg.serverContent?.interrupted) {
              setStatus('listening');
              resetSilenceTimeout();
            }

            // 4. User Transcription
            if (msg.inputAudioTranscription) {
              const userText = msg.inputAudioTranscription.transcription;
              if (userText) {
                setTranscript(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === 'user') {
                    const updated = [...prev];
                    updated[updated.length - 1] = { ...last, text: userText };
                    return updated;
                  }
                  return [...prev, { role: 'user', text: userText }];
                });
                if (msg.inputAudioTranscription.done) {
                  setStatus('listening');
                  resetSilenceTimeout();
                }
              }
            }

            // 5. Model Transcription
            let modelText = modelParts
              .filter((p: any) => p.text && !p.thought)
              .map((p: any) => p.text)
              .join("")
              .trim();

            if (!modelText && msg.outputAudioTranscription) {
              modelText = msg.outputAudioTranscription.transcription;
            }

            if (modelText) {
              setTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'model') {
                  if (last.text === modelText) return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, text: modelText };
                  return updated;
                }
                return [...prev, { role: 'model', text: modelText }];
              });
            }
          },
          onclose: (e: any) => {
            console.log("Gemini Live API connection closed", e?.code, e?.reason);
            if (!isStoppingRef.current) {
              stopSession();
            }
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            setError(err?.message || String(err) || "Connection error occurred");
            if (!isStoppingRef.current) {
              stopSession();
            }
          }
        }
      });

      sessionRef.current = session;
      console.log("Session established, waiting for audio...");

    } catch (error) {
      console.error("Failed to start session:", error);
      // Stop the microphone if connection failed
      audioStreamerRef.current?.stop();
      setError(error instanceof Error ? error.message : "An unexpected error occurred");
      setIsConnecting(false);
      isStoppingRef.current = false;
    }
  };

  const processCallTranscript = async (currentTranscript: { role: 'user' | 'model', text: string }[]) => {
    setIsProcessing(true);
    try {
      const fullText = currentTranscript.map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n');
      const response = await fetch('/api/conversations/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_text: fullText })
      });
      if (response.ok) {
        await fetchDashboardData();
      }
    } catch (error) {
      console.error("Error processing call transcript:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 relative overflow-x-hidden bg-[#050505]">
      {/* Background Orbs */}
      <div className="orb-glow w-[500px] h-[500px] bg-purple-600/20 top-[-10%] left-[-10%]" />
      <div className="orb-glow w-[400px] h-[400px] bg-pink-600/20 bottom-[-10%] right-[-10%]" />
      <div className="orb-glow w-[300px] h-[300px] bg-cyan-600/20 top-[20%] right-[10%]" />

      <div className="w-full max-w-6xl flex flex-col gap-8 z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold tracking-widest uppercase text-purple-300"
            >
              <Sparkles size={12} className="text-purple-400" />
              Atman Cloud Consultants • AI Voice
            </motion.div>
            <h1 className="text-4xl font-black tracking-tighter text-white">
              Atman <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Cloud Consultants</span>
            </h1>
          </div>

          <nav className="flex items-center gap-2 p-1 bg-white/5 border border-white/10 rounded-xl">
            <button
              onClick={() => setActiveTab('agent')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'agent' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-purple-300/50 hover:text-purple-300'
              }`}
            >
              <Mic size={14} /> Voice Agent
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'dashboard' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-purple-300/50 hover:text-purple-300'
              }`}
            >
              <LayoutDashboard size={14} /> Dashboard
            </button>
          </nav>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'agent' ? (
            <motion.div
              key="agent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Voice Interaction Area */}
              <div className="lg:col-span-7 glass-card p-10 flex flex-col items-center justify-center gap-10 min-h-[500px]">
                <div className="relative flex items-center justify-center">
                  <AnimatePresence>
                    {isConnected && (
                      <>
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{
                            scale: status === 'speaking' ? [1, 1.2, 1] : 1,
                            opacity: 1,
                            rotate: 360
                          }}
                          transition={{
                            scale: { repeat: Infinity, duration: 1.5 },
                            rotate: { repeat: Infinity, duration: 20, ease: "linear" }
                          }}
                          className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-cyan-500 blur-3xl opacity-30"
                        />
                        <motion.div
                          animate={{
                            scale: status === 'speaking' ? [1, 1.05, 1] : 1,
                          }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="relative w-48 h-48 rounded-full bg-white/5 backdrop-blur-3xl border border-white/10 flex items-center justify-center shadow-2xl"
                        >
                          {status === 'speaking' ? (
                            <div className="flex items-center gap-1.5">
                              {[...Array(6)].map((_, i) => (
                                <motion.div
                                  key={i}
                                  animate={{
                                    height: [16, 16 + (volume * 60 * (i % 2 === 0 ? 1 : 0.8)), 16]
                                  }}
                                  transition={{
                                    repeat: Infinity,
                                    duration: 0.4,
                                    delay: i * 0.05
                                  }}
                                  className="w-2 bg-white rounded-full"
                                />
                              ))}
                            </div>
                          ) : (
                            <Mic size={64} className="text-white/20" />
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>

                  {!isConnected && !isConnecting && (
                    <div className="w-48 h-48 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Phone size={64} className="text-white/10" />
                    </div>
                  )}

                  {isConnecting && (
                    <div className="w-48 h-48 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Activity size={64} className="text-purple-400 animate-pulse" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-6 w-full max-w-sm">
                  <div className="text-center space-y-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-purple-300/40">Status</div>
                    <div className="text-sm font-medium text-purple-100">
                      {isConnecting ? 'Establishing secure connection...' :
                       isConnected ? (status === 'speaking' ? 'Agent is speaking...' : 'Listening to you...') :
                       'Ready to start conversation'}
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center font-medium"
                    >
                      {error}
                    </motion.div>
                  )}

                  {!isConnected ? (
                    <button
                      onClick={startSession}
                      disabled={isConnecting}
                      className="group relative w-full py-6 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-black text-xl shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                      <span className="relative flex items-center justify-center gap-3">
                        {isConnecting ? 'Connecting...' : 'बातचीत शुरू करें'}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={stopSession}
                      className="w-full py-6 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                      <PhoneOff size={24} className="text-red-400" />
                      कॉल समाप्त करें
                    </button>
                  )}
                </div>
              </div>

              {/* Transcript Area */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="glass-card overflow-hidden flex flex-col h-[500px]">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={16} className="text-purple-400" />
                      <h2 className="text-[10px] font-bold uppercase tracking-widest text-purple-200">Live Transcript</h2>
                    </div>
                    {isProcessing && (
                      <div className="flex items-center gap-2">
                        <Activity size={12} className="text-purple-400 animate-spin" />
                        <span className="text-[10px] text-purple-400 font-bold uppercase">Processing...</span>
                      </div>
                    )}
                  </div>
                  <div ref={scrollRef} className="flex-grow overflow-y-auto p-6 space-y-4 scroll-smooth bg-black/20">
                    {transcript.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-white/10 text-center space-y-4">
                        <MessageSquare size={48} className="opacity-20" />
                        <div className="text-xs italic max-w-[200px]">
                          बातचीत शुरू होने पर यहाँ लाइव ट्रांसक्रिप्ट दिखाई देगी...
                        </div>
                      </div>
                    )}
                    {transcript.map((msg, i) => (
                      <motion.div
                        initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={i}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`text-[10px] uppercase tracking-wider mb-1 font-bold ${msg.role === 'user' ? 'text-purple-400' : 'text-pink-400'}`}>
                          {msg.role === 'user' ? 'You' : 'Atman Cloud AI'}
                        </div>
                        <div className={`max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-purple-100 rounded-tl-none'
                        }`}>
                          {msg.text}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="glass-card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300/40">Quick Tip</div>
                    <div className="text-xs text-purple-200">All conversations are automatically analyzed and stored in the dashboard.</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Dashboard logs={logs} leads={leads} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="mt-12 text-purple-300/20 text-[10px] font-mono tracking-[0.4em] uppercase z-10">
        Atman Cloud Consultants • AI Voice Division • 2024
      </footer>
    </div>
  );
}