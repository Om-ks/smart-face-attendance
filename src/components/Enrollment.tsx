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
  ShieldCheck,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { EnrolledStudent } from '@/types';
import { extractFaceFromImage, areModelsLoaded, loadModels } from '@/lib/faceApi';
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
  const [inputMode, setInputMode] = useState<'camera' | 'gallery'>('gallery');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Multi-angle captured samples (1 to 3)
  const [samples, setSamples] = useState<CapturedSample[]>([]);

  // Processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingPreviewUrl, setAnalyzingPreviewUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  // Camera & File Input Refs
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
      await loadModels();
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const result = await extractFaceFromImage(canvas);

      if (!result) {
        setStatusMsg({
          type: 'error',
          text: '⚠️ No face detected. Please face the camera directly with good lighting.',
        });
      } else {
        const newSample: CapturedSample = {
          id: 'sample_' + Date.now(),
          descriptor: result.descriptor,
          thumbnail: result.thumbnail,
          label: samples.length === 0 ? 'Front View' : `Sample ${samples.length + 1}`,
        };

        setSamples((prev) => [...prev, newSample]);
        setStatusMsg({
          type: 'success',
          text: '✅ Face verified & 128-D embedding extracted successfully!',
        });
        playSuccessChime();
      }
    } catch (err: any) {
      console.error('Snapshot processing error:', err);
      setStatusMsg({ type: 'error', text: 'Error analyzing frame: ' + (err.message || 'Error') });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Upload Photo from Gallery / File (Rock-Solid FileReader Implementation)
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMsg(null);
    setIsAnalyzing(true);

    const reader = new FileReader();
    reader.onerror = () => {
      setStatusMsg({ type: 'error', text: 'Failed to read file from gallery.' });
      setIsAnalyzing(false);
    };

    reader.onload = async (event) => {
      try {
        const dataUrl = event.target?.result as string;
        setAnalyzingPreviewUrl(dataUrl);

        const img = new Image();
        img.onload = async () => {
          try {
            await loadModels();
            const result = await extractFaceFromImage(img);

            if (!result) {
              setStatusMsg({
                type: 'error',
                text: '⚠️ No clear face detected in this image. Please upload a well-lit photo looking straight at the camera.',
              });
            } else {
              const newSample: CapturedSample = {
                id: 'sample_' + Date.now(),
                descriptor: result.descriptor,
                thumbnail: result.thumbnail,
                label: samples.length === 0 ? 'Front Photo' : `Sample ${samples.length + 1}`,
              };

              setSamples((prev) => [...prev, newSample]);
              setStatusMsg({
                type: 'success',
                text: '✅ Gallery photo verified & 128-D features extracted!',
              });
              playSuccessChime();
            }
          } catch (modelErr: any) {
            console.error('Face extraction error:', modelErr);
            setStatusMsg({
              type: 'error',
              text: 'Face analysis error: ' + (modelErr.message || 'Failed to detect face'),
            });
          } finally {
            setIsAnalyzing(false);
            setAnalyzingPreviewUrl(null);
          }
        };

        img.onerror = () => {
          setStatusMsg({ type: 'error', text: 'Could not decode image format.' });
          setIsAnalyzing(false);
          setAnalyzingPreviewUrl(null);
        };

        img.src = dataUrl;
      } catch (err: any) {
        console.error('Gallery file reading error:', err);
        setStatusMsg({ type: 'error', text: 'Error processing file: ' + err.message });
        setIsAnalyzing(false);
        setAnalyzingPreviewUrl(null);
      }
    };

    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      department: department.trim() || 'General',
      descriptors: samples.map((s) => s.descriptor),
      thumbnail: samples[0].thumbnail,
      createdAt: new Date().toISOString(),
    };

    const saved = saveEnrolledStudent(newStudent);
    if (saved) {
      onStudentEnrolled();
      setStatusMsg({
        type: 'success',
        text: `🎉 Successfully enrolled ${newStudent.name}! You can now scan in the Live Scanner.`,
      });
      playSuccessChime();

      // Reset form
      setName('');
      setRollNo('');
      setDepartment('');
      setSamples([]);
    } else {
      setStatusMsg({ type: 'error', text: 'Storage error: Could not save student.' });
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Student Biometric Enrollment
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload from your phone/laptop gallery or capture live via camera.
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToScanner}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
          >
            <span>Go to Live Scanner</span>
            <ArrowRight className="w-4 h-4 text-indigo-400" />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMsg && (
          <div
            className={`mt-4 p-4 rounded-2xl text-xs flex items-center gap-3 border animate-in fade-in duration-200 ${
              statusMsg.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {statusMsg.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            )}
            <span className="font-medium">{statusMsg.text}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Student Details */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white">1. Student Details</h3>
              <p className="text-[11px] text-slate-400">Fill in the basic student credentials</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
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
                placeholder="Enter Roll / ID number"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
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
                placeholder="e.g. Computer Science / Sem 5"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            {/* Enrolled Samples Preview */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300">
                  Enrolled Face Photos ({samples.length}/3)
                </span>
                <span className="text-[11px] text-slate-400">1 photo is enough</span>
              </div>

              {samples.length === 0 ? (
                <div className="border border-dashed border-slate-800 rounded-2xl p-5 text-center text-xs text-slate-500 bg-slate-950/40">
                  No photo added yet. Choose a photo from the right.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {samples.map((s) => (
                    <div
                      key={s.id}
                      className="relative bg-slate-950 border border-indigo-500/30 rounded-2xl p-2 flex flex-col items-center shadow-lg"
                    >
                      <img
                        src={s.thumbnail}
                        alt={s.label}
                        className="w-16 h-16 rounded-xl object-cover border border-emerald-500/50"
                      />
                      <span className="text-[10px] text-emerald-400 font-medium mt-1 truncate max-w-full">
                        ✓ Verified
                      </span>
                      <button
                        onClick={() => removeSample(s.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center transition shadow"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSaveStudent}
            disabled={samples.length === 0 || !name.trim() || !rollNo.trim()}
            className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Enroll & Save Student Profile</span>
          </button>
        </div>

        {/* Right Column: Capture / Gallery Photo Input */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
          {/* Mode Switcher */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">2. Add Face Photo</h3>
              <p className="text-[11px] text-slate-400">Select how you want to provide the photo</p>
            </div>

            <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                onClick={() => setInputMode('gallery')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
                  inputMode === 'gallery'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Gallery</span>
              </button>

              <button
                onClick={() => setInputMode('camera')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
                  inputMode === 'camera'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera</span>
              </button>
            </div>
          </div>

          {/* Gallery View */}
          {inputMode === 'gallery' && (
            <div className="space-y-4">
              {/* Drop / Click Area */}
              <div
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[300px] ${
                  isAnalyzing
                    ? 'border-indigo-500/80 bg-indigo-950/20'
                    : 'border-slate-700/80 hover:border-indigo-500/80 bg-slate-950/60 hover:bg-slate-950'
                }`}
              >
                {isAnalyzing ? (
                  <div className="flex flex-col items-center space-y-3">
                    {analyzingPreviewUrl ? (
                      <img
                        src={analyzingPreviewUrl}
                        alt="Preview"
                        className="w-24 h-24 rounded-2xl object-cover border-2 border-indigo-400 animate-pulse"
                      />
                    ) : (
                      <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
                    )}
                    <h4 className="text-sm font-semibold text-white">
                      Analyzing Face Features...
                    </h4>
                    <p className="text-xs text-slate-400">
                      Detecting facial landmarks and extracting 128-D vector
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-inner">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Click to Choose Photo from Gallery
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Select any clear picture from your phone gallery or computer
                      </p>
                    </div>

                    <div className="pt-2">
                      <span className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition inline-flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <span>Select Photo File</span>
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 pt-2">
                      Supports JPG, JPEG, PNG, WEBP
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={handleGalleryUpload}
                  disabled={isAnalyzing}
                  className="hidden"
                />
              </div>

              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Tip: A front-facing portrait or selfie with good lighting produces the best recognition.
                </span>
              </div>
            </div>
          )}

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

                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-44 h-44 border-2 border-dashed border-indigo-400/50 rounded-full" />
                </div>

                <button
                  onClick={() => setFacingMode((p) => (p === 'user' ? 'environment' : 'user'))}
                  className="absolute top-3 right-3 p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700/60 transition"
                  title="Flip Camera"
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">Position face inside circle and snap.</p>

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
        </div>
      </div>
    </div>
  );
};
