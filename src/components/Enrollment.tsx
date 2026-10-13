'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Trash2,
  FlipHorizontal,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { EnrolledStudent } from '@/types';
import { extractFaceFromImage, areModelsLoaded } from '@/lib/faceApi';
import { saveEnrolledStudent } from '@/lib/storage';
import { playSuccessChime } from '@/lib/sound';

interface EnrollmentProps {
  onStudentEnrolled: () => void;
  onNavigateToScanner: () => void;
}

interface CapturedSample {
  id: string;
  descriptor: number[];
  thumbnail: string;
  label: string;
}

export const Enrollment: React.FC<EnrollmentProps> = ({
  onStudentEnrolled,
  onNavigateToScanner,
}) => {
  // Form State
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [department, setDepartment] = useState('');

  // Input Mode: Camera vs Gallery
  const [inputMode, setInputMode] = useState<'camera' | 'gallery'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Multi-angle captured samples (1 to 3)
  const [samples, setSamples] = useState<CapturedSample[]>([]);

  // Processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start Camera
  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera stream error:', err);
      setStatusMsg({
        type: 'error',
        text: 'Camera error: ' + (err.message || 'Could not access camera'),
      });
    }
  }, [facingMode]);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (inputMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [inputMode, startCamera, stopCamera]);

  // Capture Photo via Webcam
  const handleCaptureSnapshot = async () => {
    if (!videoRef.current || isAnalyzing) return;
    setStatusMsg(null);
    setIsAnalyzing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      // If user facing, mirror the canvas frame
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const result = await extractFaceFromImage(canvas);

      if (!result) {
        setStatusMsg({
          type: 'error',
          text: '⚠️ No face detected! Please face the camera directly with good lighting.',
        });
      } else {
        const newSample: CapturedSample = {
          id: 'sample_' + Date.now(),
          descriptor: result.descriptor,
          thumbnail: result.thumbnail,
          label: samples.length === 0 ? 'Front View' : samples.length === 1 ? 'Left Angle' : 'Right Angle',
        };

        setSamples((prev) => [...prev, newSample]);
        setStatusMsg({
          type: 'success',
          text: '✅ Face verified & 128-D vector extracted successfully!',
        });
        playSuccessChime();
      }
    } catch (err: any) {
      console.error('Snapshot processing error:', err);
      setStatusMsg({ type: 'error', text: 'Error analyzing frame: ' + err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Upload Photo from Gallery / File
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMsg(null);
    setIsAnalyzing(true);

    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const result = await extractFaceFromImage(img);
      URL.revokeObjectURL(img.src);

      if (!result) {
        setStatusMsg({
          type: 'error',
          text: '⚠️ No clear face detected in the uploaded photo. Please choose a clearer picture.',
        });
      } else {
        const newSample: CapturedSample = {
          id: 'sample_' + Date.now(),
          descriptor: result.descriptor,
          thumbnail: result.thumbnail,
          label: samples.length === 0 ? 'Front View' : samples.length === 1 ? 'Angle 2' : 'Angle 3',
        };

        setSamples((prev) => [...prev, newSample]);
        setStatusMsg({
          type: 'success',
          text: '✅ Gallery image verified & 128-D features extracted!',
        });
        playSuccessChime();
      }
    } catch (err: any) {
      console.error('Gallery file error:', err);
      setStatusMsg({ type: 'error', text: 'Failed to process file: ' + err.message });
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove a captured sample
  const removeSample = (id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  };

  // Save Student Profile
  const handleSaveStudent = () => {
    if (!name.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter student full name.' });
      return;
    }
    if (!rollNo.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter Roll Number / Student ID.' });
      return;
    }
    if (samples.length === 0) {
      setStatusMsg({ type: 'error', text: 'Please capture or upload at least 1 face photo.' });
      return;
    }

    const newStudent: EnrolledStudent = {
      id: 'std_' + Date.now(),
      name: name.trim(),
      rollNo: rollNo.trim().toUpperCase(),
      department: department.trim(),
      descriptors: samples.map((s) => s.descriptor),
      thumbnail: samples[0].thumbnail,
      createdAt: new Date().toISOString(),
    };

    const saved = saveEnrolledStudent(newStudent);
    if (saved) {
      onStudentEnrolled();
      setStatusMsg({
        type: 'success',
        text: `🎉 Successfully enrolled ${newStudent.name}! Ready for live scanning.`,
      });
      playSuccessChime();

      // Reset form
      setName('');
      setRollNo('');
      setSamples([]);
    } else {
      setStatusMsg({ type: 'error', text: 'Storage error: Could not save student.' });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-400" />
              Student Biometric Enrollment
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Extract 128-D facial feature embeddings via live webcam or gallery upload.
            </p>
          </div>

          {/* Quick link to scanner */}
          <button
            onClick={onNavigateToScanner}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
          >
            <span>Go to Live Scanner</span>
            <ArrowRight className="w-4 h-4 text-indigo-400" />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMsg && (
          <div
            className={`mt-4 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 border animate-in fade-in duration-200 ${
              statusMsg.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {statusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Student Details Form */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
          <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3">
            1. Student Information
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name (e.g. Alex Morgan)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Roll Number / Student ID <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                placeholder="Enter Roll / ID (e.g. 101)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Class / Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          {/* Captured Samples List */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-300">
                Face Samples ({samples.length}/3)
              </label>
              <span className="text-[11px] text-slate-400">1 photo is sufficient</span>
            </div>

            {samples.length === 0 ? (
              <div className="border border-dashed border-slate-700 rounded-2xl p-4 text-center text-xs text-slate-500">
                No face captured yet. Snap a photo or upload from gallery.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {samples.map((s, idx) => (
                  <div
                    key={s.id}
                    className="relative group bg-slate-950 border border-slate-800 rounded-xl p-1.5 flex flex-col items-center"
                  >
                    <img
                      src={s.thumbnail}
                      alt={s.label}
                      className="w-16 h-16 rounded-lg object-cover border border-indigo-500/40"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 truncate max-w-full">
                      {s.label}
                    </span>
                    <button
                      onClick={() => removeSample(s.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center transition shadow-md"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSaveStudent}
            disabled={samples.length === 0 || !name.trim() || !rollNo.trim()}
            className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Complete Enrollment & Save</span>
          </button>
        </div>

        {/* Right Column: Capture / Upload Workspace */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          {/* Mode Switch Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-white">2. Capture Face Features</h3>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setInputMode('camera')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                  inputMode === 'camera'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Webcam</span>
              </button>
              <button
                onClick={() => setInputMode('gallery')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                  inputMode === 'gallery'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Gallery Upload</span>
              </button>
            </div>
          </div>

          {/* Camera View */}
          {inputMode === 'camera' && (
            <div className="space-y-4">
              <div className="relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[300px]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full max-h-[340px] object-cover ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  }`}
                />

                {/* Face Guide Box */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-44 h-44 border-2 border-dashed border-indigo-400/50 rounded-full" />
                </div>

                {/* Flip camera button */}
                <button
                  onClick={() => setFacingMode((p) => (p === 'user' ? 'environment' : 'user'))}
                  className="absolute top-3 right-3 p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700/60 transition"
                  title="Flip Camera"
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  Align face inside circle and snap photo.
                </p>

                <button
                  onClick={handleCaptureSnapshot}
                  disabled={isAnalyzing || samples.length >= 3}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 flex items-center gap-2 transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>{isAnalyzing ? 'Extracting Vector...' : 'Snap & Verify Face'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Gallery View */}
          {inputMode === 'gallery' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-950/60 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition group min-h-[280px]"
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 group-hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3 transition">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-white">Click to Select from Gallery</h4>
                <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, WEBP (Max 10MB)</p>
                <span className="mt-3 text-[11px] px-3 py-1 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                  Select Photo File
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleGalleryUpload}
                  className="hidden"
                />
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Tip: Upload a well-lit passport-style or front selfie photo for highest accuracy.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
