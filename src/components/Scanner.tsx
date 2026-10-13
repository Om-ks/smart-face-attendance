'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  Volume2,
  VolumeX,
  AlertCircle,
  FlipHorizontal,
  CheckCircle2,
  Scan,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { EnrolledStudent } from '@/types';
import {
  detectAllFacesInVideo,
  findBestMatch,
  computeEuclideanDistance,
  areModelsLoaded,
  loadModels,
} from '@/lib/faceApi';
import { markAttendance } from '@/lib/storage';
import { playSuccessChime, speakStudentName } from '@/lib/sound';

interface ScannerProps {
  students: EnrolledStudent[];
  onAttendanceMarked: () => void;
}

interface ActiveIdentity {
  student: EnrolledStudent;
  confidence: number;
  lastSeen: number;
}

export const Scanner: React.FC<ScannerProps> = ({ students, onAttendanceMarked }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioFeedback, setAudioFeedback] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>('Initializing Camera...');

  // Track already notified IDs in this current session so sound/confetti only fire once
  const notifiedStudentIds = useRef<Set<string>>(new Set());

  // Temporal smoothing lock: holds recognized identity for 1.2s to prevent frame-by-frame flicker
  const smoothedIdentityRef = useRef<ActiveIdentity | null>(null);

  // Recent match for HUD notification banner
  const [lastMatch, setLastMatch] = useState<{
    student: EnrolledStudent;
    confidence: number;
    time: string;
    isNew: boolean;
  } | null>(null);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      await loadModels();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
          setScanStatus('Ready. Look into camera to mark attendance.');
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not connect to camera: ' + (err.message || 'Unknown error')
      );
      setCameraActive(false);
    }
  }, [facingMode]);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Real-Time ML Face Detection Loop with Smoothing
  useEffect(() => {
    let animationFrameId: number;
    let isSubscribed = true;
    let lastScanTime = 0;

    const processFrame = async (timestamp: number) => {
      if (!isSubscribed) return;

      // Throttle scan to ~150ms for smooth 60fps rendering without CPU heating
      if (
        timestamp - lastScanTime > 150 &&
        videoRef.current &&
        canvasRef.current &&
        videoRef.current.readyState === 4 &&
        areModelsLoaded()
      ) {
        lastScanTime = timestamp;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            const detections = await detectAllFacesInVideo(video);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const now = Date.now();

            if (detections.length === 0) {
              // If no face seen for 1.2s, release smoothed identity
              if (
                smoothedIdentityRef.current &&
                now - smoothedIdentityRef.current.lastSeen > 1200
              ) {
                smoothedIdentityRef.current = null;
              }
              setScanStatus('Scanning for face...');
            } else {
              setScanStatus(`Face in frame (Tracking...)`);
            }

            for (const det of detections) {
              const { box } = det.detection;

              // 1. Check primary match
              let match = findBestMatch(det.descriptor, students, 0.65);

              // 2. Hysteresis Smoothing: If recently recognized, keep the identity locked
              // even if distance momentarily blips up to 0.72 due to speech/tilt
              if (
                !match &&
                smoothedIdentityRef.current &&
                now - smoothedIdentityRef.current.lastSeen < 1200
              ) {
                const heldStudent = smoothedIdentityRef.current.student;
                if (heldStudent.descriptors && heldStudent.descriptors.length > 0) {
                  let minHysteresisDist = Infinity;
                  for (const desc of heldStudent.descriptors) {
                    const d = computeEuclideanDistance(det.descriptor, desc);
                    if (d < minHysteresisDist) minHysteresisDist = d;
                  }
                  if (minHysteresisDist <= 0.72) {
                    match = {
                      student: heldStudent,
                      distance: minHysteresisDist,
                      confidence: smoothedIdentityRef.current.confidence,
                    };
                  }
                }
              }

              if (match) {
                // Update smoothed memory
                smoothedIdentityRef.current = {
                  student: match.student,
                  confidence: match.confidence,
                  lastSeen: now,
                };

                // MATCH FOUND: Draw Green HUD Box
                ctx.strokeStyle = '#10B981';
                ctx.lineWidth = 4;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                // High-tech corner brackets
                const cornerLen = 14;
                ctx.beginPath();
                ctx.moveTo(box.x, box.y + cornerLen);
                ctx.lineTo(box.x, box.y);
                ctx.lineTo(box.x + cornerLen, box.y);
                ctx.moveTo(box.x + box.width - cornerLen, box.y);
                ctx.lineTo(box.x + box.width, box.y);
                ctx.lineTo(box.x + box.width, box.y + cornerLen);
                ctx.stroke();

                // Pill label
                const label = `${match.student.name} • ${match.confidence}% Match`;
                ctx.font = 'bold 14px system-ui, sans-serif';
                const textWidth = ctx.measureText(label).width;

                ctx.fillStyle = '#10B981';
                ctx.fillRect(box.x, Math.max(0, box.y - 30), textWidth + 18, 28);

                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(label, box.x + 8, Math.max(18, box.y - 10));

                // Process Attendance Mark with Strict Daily Deduplication
                const result = markAttendance(match.student, match.confidence);

                if (result.recorded) {
                  // NEW RECORD ADDED FOR TODAY
                  onAttendanceMarked();
                  notifiedStudentIds.current.add(match.student.id);

                  setLastMatch({
                    student: match.student,
                    confidence: match.confidence,
                    time: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    isNew: true,
                  });

                  if (audioFeedback) {
                    playSuccessChime();
                    speakStudentName(match.student.name);
                  }

                  confetti({
                    particleCount: 35,
                    spread: 60,
                    origin: { y: 0.7 },
                  });
                } else if (result.alreadyMarked && result.record) {
                  // ALREADY MARKED TODAY (DO NOT DUPLICATE IN ATTENDANCE SHEET)
                  setLastMatch({
                    student: match.student,
                    confidence: match.confidence,
                    time: result.record.formattedTime,
                    isNew: false,
                  });
                }
              } else {
                // UNREGISTERED: Amber Box
                ctx.strokeStyle = '#F59E0B';
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                const label = 'Unregistered Face';
                ctx.font = '13px system-ui, sans-serif';
                const textWidth = ctx.measureText(label).width;

                ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
                ctx.fillRect(box.x, Math.max(0, box.y - 26), textWidth + 14, 24);

                ctx.fillStyle = '#000000';
                ctx.fillText(label, box.x + 6, Math.max(16, box.y - 9));
              }
            }
          } catch (scanErr) {
            console.error('Frame scan error:', scanErr);
          }
        }
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    animationFrameId = requestAnimationFrame(processFrame);

    return () => {
      isSubscribed = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [students, audioFeedback, onAttendanceMarked]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              Live Biometric Attendance Scanner
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </h2>
            <p className="text-xs text-slate-400">
              {students.length === 0
                ? '⚠️ No students enrolled yet. Go to "Enroll Face" first!'
                : `Active database: ${students.length} enrolled student(s)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Flip Camera */}
          <button
            onClick={toggleFacingMode}
            title="Switch front/back camera"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
          >
            <FlipHorizontal className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Flip Camera</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => setAudioFeedback(!audioFeedback)}
            title="Toggle sound announcement"
            className={`p-2.5 rounded-xl text-xs border transition ${
              audioFeedback
                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {audioFeedback ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Restart Camera */}
          <button
            onClick={startCamera}
            title="Restart Camera"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewfinder Card */}
      <div className="relative bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center justify-center min-h-[380px] sm:min-h-[460px]">
        {/* Error message */}
        {errorMsg && (
          <div className="absolute inset-0 z-30 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-base font-semibold text-white">Camera Access Error</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">{errorMsg}</p>
            <button
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Live Status Pill at Top of Camera */}
        <div className="absolute top-4 z-20 px-3.5 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-[11px] text-slate-300 flex items-center gap-2 shadow-lg">
          <Scan className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>{scanStatus}</span>
        </div>

        {/* Video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full max-h-[500px] object-cover sm:object-contain ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Canvas overlay for bounding boxes */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full max-h-[500px] object-cover sm:object-contain pointer-events-none ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Live HUD Floating Notification */}
        {lastMatch && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-20 bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-300">
            {lastMatch.student.thumbnail ? (
              <img
                src={lastMatch.student.thumbnail}
                alt={lastMatch.student.name}
                className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-400 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold shrink-0">
                {lastMatch.student.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  {lastMatch.student.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {lastMatch.confidence}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">Roll: {lastMatch.student.rollNo}</p>
              <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3" />
                <span>
                  {lastMatch.isNew
                    ? '🎉 Just Marked Present!'
                    : `Marked Present Today (${lastMatch.time})`}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
