export interface EnrolledStudent {
  id: string;
  name: string;
  rollNo: string;
  department: string;
  descriptors: number[][]; // Array of 128-D vectors (supports 1 to 3 face angles)
  thumbnail: string;       // Compressed base64 avatar image
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  name: string;
  rollNo: string;
  department?: string;
  thumbnail?: string;
  timestamp: string;      // ISO string
  formattedTime: string;  // e.g. "10:35:22 AM"
  formattedDate: string;  // e.g. "14 Oct 2026"
  confidence: number;     // 0 to 100%
  status: 'Present' | 'Late';
}

export interface RecognitionMatch {
  student: EnrolledStudent;
  distance: number;
  confidence: number; // percentage (0 - 100)
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type ActiveTab = 'scanner' | 'enroll' | 'students' | 'records';
