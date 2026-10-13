import { EnrolledStudent, AttendanceRecord } from '@/types';

const STUDENTS_KEY = 'smartface_enrolled_students_v1';
const ATTENDANCE_KEY = 'smartface_attendance_records_v1';

// --- STUDENT STORAGE ---

export function getEnrolledStudents(): EnrolledStudent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STUDENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to load students from localStorage:', err);
    return [];
  }
}

export function saveEnrolledStudent(student: EnrolledStudent): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = getEnrolledStudents();
    const existingIndex = current.findIndex((s) => s.id === student.id || s.rollNo.toLowerCase() === student.rollNo.toLowerCase());
    
    if (existingIndex >= 0) {
      current[existingIndex] = student;
    } else {
      current.unshift(student);
    }
    
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(current));
    return true;
  } catch (err) {
    console.error('Failed to save student:', err);
    return false;
  }
}

export function deleteEnrolledStudent(id: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = getEnrolledStudents().filter((s) => s.id !== id);
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(current));
    return true;
  } catch (err) {
    console.error('Failed to delete student:', err);
    return false;
  }
}

export function clearAllStudents(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STUDENTS_KEY);
}

// --- ATTENDANCE STORAGE ---

export function getAttendanceRecords(): AttendanceRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to load attendance:', err);
    return [];
  }
}

export function markAttendance(
  student: EnrolledStudent,
  confidence: number,
  cooldownMinutes: number = 30
): { recorded: boolean; record: AttendanceRecord | null; message: string } {
  if (typeof window === 'undefined') {
    return { recorded: false, record: null, message: 'Window not loaded' };
  }

  try {
    const records = getAttendanceRecords();
    const now = new Date();
    const todayDateStr = now.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    // Check if student was marked recently within cooldown period
    const recent = records.find((r) => {
      if (r.studentId !== student.id) return false;
      const recordTime = new Date(r.timestamp).getTime();
      const diffMinutes = (now.getTime() - recordTime) / (1000 * 60);
      return diffMinutes < cooldownMinutes;
    });

    if (recent) {
      return {
        recorded: false,
        record: recent,
        message: `Already marked at ${recent.formattedTime}`,
      };
    }

    const newRecord: AttendanceRecord = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      studentId: student.id,
      name: student.name,
      rollNo: student.rollNo,
      department: student.department,
      thumbnail: student.thumbnail,
      timestamp: now.toISOString(),
      formattedTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      formattedDate: todayDateStr,
      confidence: Math.round(confidence),
      status: 'Present',
    };

    records.unshift(newRecord);
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records));

    return {
      recorded: true,
      record: newRecord,
      message: `Marked Present with ${Math.round(confidence)}% confidence`,
    };
  } catch (err) {
    console.error('Failed to mark attendance:', err);
    return { recorded: false, record: null, message: 'Storage error' };
  }
}

export function clearAttendanceRecords(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ATTENDANCE_KEY);
}

// --- BACKUP & EXPORT HELPERS ---

export function exportDatabaseToJSON(): string {
  const students = getEnrolledStudents();
  const attendance = getAttendanceRecords();
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    students,
    attendance,
  }, null, 2);
}

export function importDatabaseFromJSON(jsonString: string): { success: boolean; count: number; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data.students || !Array.isArray(data.students)) {
      return { success: false, count: 0, error: 'Invalid file format: Missing students array.' };
    }

    const existing = getEnrolledStudents();
    const existingIds = new Set(existing.map((s) => s.id));
    
    let addedCount = 0;
    for (const student of data.students) {
      if (!existingIds.has(student.id)) {
        existing.push(student);
        existingIds.add(student.id);
        addedCount++;
      }
    }

    localStorage.setItem(STUDENTS_KEY, JSON.stringify(existing));

    if (data.attendance && Array.isArray(data.attendance)) {
      const existingAtt = getAttendanceRecords();
      const existingAttIds = new Set(existingAtt.map((a) => a.id));
      for (const att of data.attendance) {
        if (!existingAttIds.has(att.id)) {
          existingAtt.push(att);
        }
      }
      localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(existingAtt));
    }

    return { success: true, count: addedCount };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Corrupted JSON' };
  }
}

export function exportAttendanceToCSV(): void {
  const records = getAttendanceRecords();
  if (records.length === 0) return;

  const headers = ['Record ID', 'Roll Number', 'Student Name', 'Department', 'Date', 'Time', 'Match Confidence (%)', 'Status'];
  const rows = records.map((r) => [
    `"${r.id}"`,
    `"${r.rollNo}"`,
    `"${r.name}"`,
    `"${r.department || 'General'}"`,
    `"${r.formattedDate}"`,
    `"${r.formattedTime}"`,
    `${r.confidence}%`,
    `"${r.status}"`,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Attendance_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
