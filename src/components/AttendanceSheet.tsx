'use client';

import React, { useState } from 'react';
import {
  ClipboardCheck,
  Download,
  Trash2,
  Search,
  CheckCircle2,
  Calendar,
  Clock,
  UserX,
  TrendingUp,
} from 'lucide-react';
import { AttendanceRecord, EnrolledStudent } from '@/types';
import { exportAttendanceToCSV, clearAttendanceRecords } from '@/lib/storage';

interface AttendanceSheetProps {
  records: AttendanceRecord[];
  students: EnrolledStudent[];
  onRecordsUpdated: () => void;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  records,
  students,
  onRecordsUpdated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecords = records.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.formattedDate.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Statistics
  const totalEnrolled = students.length;
  // Get unique students marked present today
  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const todayUniquePresentIds = new Set(
    records.filter((r) => r.formattedDate === todayStr).map((r) => r.studentId)
  );
  const presentCountToday = todayUniquePresentIds.size;
  const absentCountToday = Math.max(0, totalEnrolled - presentCountToday);
  const attendanceRate =
    totalEnrolled > 0 ? Math.round((presentCountToday / totalEnrolled) * 100) : 0;

  const handleClear = () => {
    if (confirm('Clear all attendance logs? This cannot be undone.')) {
      clearAttendanceRecords();
      onRecordsUpdated();
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Enrolled */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Total Registered</p>
            <h3 className="text-xl font-bold text-white">{totalEnrolled}</h3>
          </div>
        </div>

        {/* Present Today */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Present Today</p>
            <h3 className="text-xl font-bold text-emerald-400">{presentCountToday}</h3>
          </div>
        </div>

        {/* Absent Today */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <UserX className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Pending / Absent</p>
            <h3 className="text-xl font-bold text-amber-400">{absentCountToday}</h3>
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Turnout Rate</p>
            <h3 className="text-xl font-bold text-cyan-400">{attendanceRate}%</h3>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        {/* Actions & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Biometric Attendance Log
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                {records.length} Scans
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Real-time audit log of recognized students with face match confidence scores.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportAttendanceToCSV}
              disabled={records.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-emerald-600/30 transition"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV (Excel)</span>
            </button>

            {records.length > 0 && (
              <button
                onClick={handleClear}
                className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                title="Clear all logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, roll number, or date..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Roll No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No attendance records found. Start scanning faces in the Live Scanner!
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.thumbnail ? (
                          <img
                            src={r.thumbnail}
                            alt={r.name}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-xs">
                            {r.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white">{r.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {r.department || 'General'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-200">{r.rollNo}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{r.formattedDate}</td>
                    <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                      {r.formattedTime}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {r.confidence}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Present</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
