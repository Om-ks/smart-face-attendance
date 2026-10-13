'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Navbar } from '@/components/Navbar';
import { StudentsList } from '@/components/StudentsList';
import { AttendanceSheet } from '@/components/AttendanceSheet';
import { ActiveTab, EnrolledStudent, AttendanceRecord } from '@/types';
import { loadModels } from '@/lib/faceApi';
import { getEnrolledStudents, getAttendanceRecords } from '@/lib/storage';

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
    </div>
  );
}
