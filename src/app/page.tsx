'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Navbar } from '@/components/Navbar';
import { StudentsList } from '@/components/StudentsList';
import { AttendanceSheet } from '@/components/AttendanceSheet';
import { ActiveTab, EnrolledStudent, AttendanceRecord } from '@/types';
import { loadModels } from '@/lib/faceApi';
import { getEnrolledStudents, getAttendanceRecords } from '@/lib/storage';
import { BrainCircuit, Check, X } from 'lucide-react';

// Dynamically import camera components with SSR disabled
const Scanner = dynamic(
  () => import('@/components/Scanner').then((mod) => mod.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-4xl mx-auto min-h-[400px] bg-slate-900/60 border border-slate-800 rounded-3xl flex items-center justify-center text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Initializing Camera & AI Scanner...</span>
        </div>
      </div>
    ),
  }
);

const Enrollment = dynamic(
  () => import('@/components/Enrollment').then((mod) => mod.Enrollment),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-4xl mx-auto min-h-[400px] bg-slate-900/60 border border-slate-800 rounded-3xl flex items-center justify-center text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading Enrollment Studio...</span>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [modelsReady, setModelsReady] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  // Viva modal open state
  const [showVivaModal, setShowVivaModal] = useState(false);

  // Load storage data
  const refreshData = useCallback(() => {
    setStudents(getEnrolledStudents());
    setAttendance(getAttendanceRecords());
  }, []);

  // Initialize Models and Storage
  useEffect(() => {
    refreshData();

    async function init() {
      try {
        const ok = await loadModels();
        setModelsReady(ok);
        if (!ok) {
          setLoadingError('Failed to load neural network weights from /models');
        }
      } catch (err: any) {
        console.error('Model initialization error:', err);
        setLoadingError(err.message || 'Error loading models');
      }
    }

    init();
  }, [refreshData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white pb-20 md:pb-10">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        modelsLoaded={modelsReady}
        studentCount={students.length}
        attendanceCount={attendance.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {/* Model Loading State Banner */}
        {!modelsReady && !loadingError && (
          <div className="mb-6 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between text-xs text-indigo-200">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>
                Loading Neural Networks (SSD MobileNet + 68 Landmark Predictor + ResNet 128D
                Embedder)...
              </span>
            </div>
            <span className="text-[11px] text-indigo-400">First load takes ~3-5 seconds</span>
          </div>
        )}

        {loadingError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300">
            ⚠️ {loadingError}. Please refresh the page.
          </div>
        )}

        {/* Tab Views */}
        {activeTab === 'scanner' && (
          <Scanner students={students} onAttendanceMarked={refreshData} />
        )}

        {activeTab === 'enroll' && (
          <Enrollment
            onStudentEnrolled={refreshData}
            onNavigateToScanner={() => setActiveTab('scanner')}
          />
        )}

        {activeTab === 'students' && (
          <StudentsList
            students={students}
            onStudentsUpdated={refreshData}
            onNavigateToEnroll={() => setActiveTab('enroll')}
          />
        )}

        {activeTab === 'records' && (
          <AttendanceSheet
            records={attendance}
            students={students}
            onRecordsUpdated={refreshData}
          />
        )}
      </main>

      {/* Floating Viva / Architecture Helper Button */}
      <div className="fixed bottom-16 md:bottom-5 right-4 z-40">
        <button
          onClick={() => setShowVivaModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-white border border-indigo-500/40 shadow-xl text-xs font-semibold backdrop-blur transition group"
        >
          <BrainCircuit className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform" />
          <span>Viva & ML Info</span>
        </button>
      </div>

      {/* Viva / Examiner Modal */}
      {showVivaModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowVivaModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Project Machine Learning Summary</h3>
                <p className="text-xs text-slate-400">Quick cheat-sheet for external examiner viva</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5 text-indigo-300">
                  <Check className="w-4 h-4 text-emerald-400" />
                  1. Which algorithms are used?
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  • <strong>Face Detection:</strong> SSD MobileNet v1 (Single Shot MultiBox Detector).<br />
                  • <strong>Landmark Alignment:</strong> 68-Point Facial Keypoint Predictor.<br />
                  • <strong>Feature Extraction:</strong> Deep ResNet-34 based FaceNet architecture producing a <strong>128-dimensional embedding vector</strong>.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5 text-indigo-300">
                  <Check className="w-4 h-4 text-emerald-400" />
                  2. How does face matching work?
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  We calculate the <strong>Euclidean Distance (L2 Norm)</strong> between the live 128-D vector and registered student vectors:
                  <br />
                  <code className="text-emerald-300 font-mono text-[11px] block mt-1">
                    d(u, v) = sqrt( sum( (u_i - v_i)^2 ) )
                  </code>
                  If distance ≤ 0.55, the identity is verified.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5 text-indigo-300">
                  <Check className="w-4 h-4 text-emerald-400" />
                  3. Why run client-side on Vercel?
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  • <strong>Zero Latency:</strong> Inference runs at 30–60 FPS locally using WebGL & WebAssembly.<br />
                  • <strong>100% Privacy:</strong> Video frames never leave the device.<br />
                  • <strong>Universal Device Access:</strong> Runs on any phone, tablet, or laptop via a standard web link without downloading any software.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowVivaModal(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
              >
                Close & Return to App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
