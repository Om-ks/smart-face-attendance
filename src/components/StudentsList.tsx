'use client';

import React, { useState } from 'react';
import {
  Users,
  Search,
  Trash2,
  Download,
  Upload,
  UserPlus,
  Calendar,
  AlertTriangle,
  FileCode2,
} from 'lucide-react';
import { EnrolledStudent } from '@/types';
import {
  deleteEnrolledStudent,
  clearAllStudents,
  exportDatabaseToJSON,
  importDatabaseFromJSON,
} from '@/lib/storage';

interface StudentsListProps {
  students: EnrolledStudent[];
  onStudentsUpdated: () => void;
  onNavigateToEnroll: () => void;
}

export const StudentsList: React.FC<StudentsListProps> = ({
  students,
  onStudentsUpdated,
  onNavigateToEnroll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.department && s.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name} from the biometric database?`)) {
      deleteEnrolledStudent(id);
      onStudentsUpdated();
      setStatusMsg({ type: 'success', text: `Deleted ${name}` });
    }
  };

  const handleClearAll = () => {
    if (confirm('⚠️ WARNING: This will delete ALL registered faces. Are you sure?')) {
      clearAllStudents();
      onStudentsUpdated();
      setStatusMsg({ type: 'success', text: 'All student records cleared.' });
    }
  };

  const handleExportJSON = () => {
    const jsonStr = exportDatabaseToJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SmartFace_Biometric_DB_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMsg({ type: 'success', text: 'Database exported as JSON!' });
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const res = importDatabaseFromJSON(content);
        if (res.success) {
          onStudentsUpdated();
          setStatusMsg({
            type: 'success',
            text: `Imported database! Added ${res.count} new student(s).`,
          });
        } else {
          setStatusMsg({ type: 'error', text: res.error || 'Failed to import JSON' });
        }
      } catch (err: any) {
        setStatusMsg({ type: 'error', text: 'Corrupted file: ' + err.message });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header & Action Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Enrolled Student Directory
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                  {students.length} Total
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage registered facial profiles and portable JSON backups.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onNavigateToEnroll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-md shadow-indigo-600/30"
            >
              <UserPlus className="w-4 h-4" />
              <span>Enroll New</span>
            </button>

            {/* Export JSON */}
            <button
              onClick={handleExportJSON}
              disabled={students.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs border border-slate-700 transition"
              title="Backup database to JSON"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Backup JSON</span>
            </button>

            {/* Import JSON */}
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 cursor-pointer text-slate-300 text-xs border border-slate-700 transition">
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Restore JSON</span>
              <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
            </label>

            {students.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs transition"
                title="Clear all students"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            className={`p-3 rounded-xl text-xs border animate-in fade-in duration-200 ${
              statusMsg.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, roll number, or department..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Students Card Grid */}
      {filteredStudents.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No Students Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? `No student matching "${searchQuery}"`
              : 'The biometric database is currently empty. Enroll your first student to get started!'}
          </p>
          <button
            onClick={onNavigateToEnroll}
            className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
          >
            Enroll a Face Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map((student) => (
            <div
              key={student.id}
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 shadow-lg transition-all duration-200 flex flex-col justify-between"
            >
              <div className="flex items-start gap-3.5">
                {student.thumbnail ? (
                  <img
                    src={student.thumbnail}
                    alt={student.name}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-500/40 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-lg shrink-0">
                    {student.name.charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">{student.name}</h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 font-semibold border border-slate-700">
                      Roll: {student.rollNo}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">
                    {student.department || 'Computer Engineering'}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1">
                  <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{student.descriptors?.length || 1} Embedding Vector(s)</span>
                </div>

                <button
                  onClick={() => handleDelete(student.id, student.name)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                  title="Delete student"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
