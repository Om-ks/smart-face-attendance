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
  areModelsLoaded,
  loadModels,
} from '@/lib/faceApi';
import { markAttendance } from '@/lib/storage';
import { playSuccessChime, speakStudentName } from '@/lib/sound';

interface ScannerProps {
  students: EnrolledStudent[];
  onAttendanceMarked: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ students, onAttendanceMarked }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioFeedback, setAudioFeedback] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>('Ready to scan');

  // Stable references so the background animation loop NEVER restarts or stops
  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  const onAttendanceMarkedRef = useRef(onAttendanceMarked);
  useEffect(() => {
    onAttendanceMarkedRef.current = onAttendanceMarked;
  }, [onAttendanceMarked]);

  const audioFeedbackRef = useRef(audioFeedback);
  useEffect(() => {
    audioFeedbackRef.current = audioFeedback;
  }, [audioFeedback]);

  const facingModeRef = useRef(facingMode);
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  // ID of currently displayed student banner to prevent frame-by-frame state re-rendering
  const activeBannerStudentIdRef = useRef<string | null>(null);
  const bannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // CONTINUOUS REAL-TIME SCANNING LOOP (Never stops, never freezes)
  useEffect(() => {
    let animationFrameId: number;
    let isSubscribed = true;
    let lastScanTime = 0;

    const processFrame = async (timestamp: number) => {
      if (!isSubscribed) return;

      if (
        timestamp - lastScanTime > 140 &&
        videoRef.current &&
        canvasRef.current &&
        videoRef.current.readyState === 4 &&
        areModelsLoaded()
      ) {
        lastScanTime = timestamp;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Match internal canvas buffer to video pixels
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            const detections = await detectAllFacesInVideo(video);
            // ALWAYS clear canvas on every frame to prevent stuck/ghost green boxes!
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const isUserFacing = facingModeRef.current === 'user';

            if (detections.length === 0) {
              setScanStatus('Scanning for face...');
            } else {
              setScanStatus(`Face in frame (Tracking...)`);

              for (const det of detections) {
                const { box } = det.detection;

                // Correct for selfie mirror mode:
                // Flip X coordinate so the box matches the mirrored selfie video,
                // while text is drawn completely UN-MIRRORED and readable!
                const renderX = isUserFacing
                  ? canvas.width - box.x - box.width
                  : box.x;

                const match = findBestMatch(det.descriptor, studentsRef.current, 0.65);

                if (match) {
                  // MATCH FOUND: Draw Green HUD Box
                  ctx.strokeStyle = '#10B981';
                  ctx.lineWidth = 4;
                  ctx.strokeRect(renderX, box.y, box.width, box.height);

                  // Corner brackets
                  const cornerLen = 14;
                  ctx.beginPath();
                  ctx.moveTo(renderX, box.y + cornerLen);
                  ctx.lineTo(renderX, box.y);
                  ctx.lineTo(renderX + cornerLen, box.y);
                  ctx.moveTo(renderX + box.width - cornerLen, box.y);
                  ctx.lineTo(renderX + box.width, box.y);
                  ctx.lineTo(renderX + box.width, box.y + cornerLen);
                  ctx.stroke();

                  // Pill label with normal (un-mirrored) text
                  const label = `${match.student.name} • ${match.confidence}%`;
                  ctx.font = 'bold 15px system-ui, sans-serif';
                  const textWidth = ctx.measureText(label).width;

                  ctx.fillStyle = '#10B981';
                  ctx.fillRect(renderX, Math.max(0, box.y - 30), textWidth + 18, 28);

                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillText(label, renderX + 8, Math.max(18, box.y - 10));

                  // Process attendance
                  const result = markAttendance(match.student, match.confidence);

                  if (result.recorded) {
                    onAttendanceMarkedRef.current();

                    // Show success banner for 3.5 seconds
                    if (activeBannerStudentIdRef.current !== match.student.id) {
                      activeBannerStudentIdRef.current = match.student.id;
                      setLastMatch({
                        student: match.student,
                        confidence: match.confidence,
                        time: new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                        isNew: true,
                      });

                      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
                      bannerTimeoutRef.current = setTimeout(() => {
                        activeBannerStudentIdRef.current = null;
                        setLastMatch(null);
                      }, 3500);

                      if (audioFeedbackRef.current) {
                        playSuccessChime();
                        speakStudentName(match.student.name);
                      }

                      confetti({
                        particleCount: 35,
                        spread: 60,
                        origin: { y: 0.7 },
                      });
                    }
                  } else if (result.alreadyMarked && result.record) {
                    // Already marked today: show passive badge without reloading
                    if (activeBannerStudentIdRef.current !== match.student.id) {
                      activeBannerStudentIdRef.current = match.student.id;
                      setLastMatch({
                        student: match.student,
                        confidence: match.confidence,
                        time: result.record.formattedTime,
                        isNew: false,
                      });

                      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
                      bannerTimeoutRef.current = setTimeout(() => {
                        activeBannerStudentIdRef.current = null;
                        setLastMatch(null);
                      }, 3500);
                    }
                  }
                } else {
                  // UNREGISTERED FACE: Amber Box
                  ctx.strokeStyle = '#F59E0B';
                  ctx.lineWidth = 3;
                  ctx.strokeRect(renderX, box.y, box.width, box.height);

                  const label = 'Unregistered Face';
                  ctx.font = '13px system-ui, sans-serif';
                  const textWidth = ctx.measureText(label).width;

                  ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
                  ctx.fillRect(renderX, Math.max(0, box.y - 26), textWidth + 14, 24);

                  ctx.fillStyle = '#000000';
                  ctx.fillText(label, renderX + 6, Math.max(16, box.y - 9));
                }
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
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    };
  }, []); // Empty dependency array: NEVER restarts or stops on state/prop updates!

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
              Continuous Biometric Scanner
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </h2>
            <p className="text-xs text-slate-400">
              {students.length === 0
                ? '⚠️ No students enrolled yet. Go to "Enroll Face" first!'
                : `Active database: ${students.length} student(s) • Ready for continuous scanning`}
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

        {/* Video feed: mirrored only for selfie view */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full max-h-[500px] object-cover sm:object-contain ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Canvas overlay: NOT mirrored in CSS so labels are 100% normal and readable */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full max-h-[500px] object-cover sm:object-contain pointer-events-none"
        />

        {/* Live HUD Floating Notification (Auto-dismisses in 3.5s) */}
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
