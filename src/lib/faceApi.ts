import { EnrolledStudent } from '@/types';

// Dynamic face-api reference so it is never evaluated during SSR
let faceapiInstance: typeof import('@vladmandic/face-api') | null = null;
let modelsLoaded = false;
let modelsLoadingPromise: Promise<boolean> | null = null;

export async function getFaceApi() {
  if (typeof window === 'undefined') return null;
  if (!faceapiInstance) {
    faceapiInstance = await import('@vladmandic/face-api');
  }
  return faceapiInstance;
}

/**
 * Loads the face detection, landmark, and recognition weights from /models
 */
export async function loadModels(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (modelsLoaded) return true;
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    try {
      const faceapi = await getFaceApi();
      if (!faceapi) return false;

      const MODEL_URL = '/models';

      // Load SSD MobileNet v1, Landmarks (68 keypoints), and Deep Metric Embedder
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
      return true;
    } catch (error) {
      console.error('Failed to load Face-API neural network models:', error);
      modelsLoaded = false;
      return false;
    } finally {
      modelsLoadingPromise = null;
    }
  })();

  return modelsLoadingPromise;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Calculates Euclidean (L2) distance between two 128-D vectors
 */
export function computeEuclideanDistance(
  v1: number[] | Float32Array,
  v2: number[] | Float32Array
): number {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = (v1[i] ?? 0) - (v2[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Compares a live face descriptor against all enrolled students
 */
export function findBestMatch(
  liveDescriptor: Float32Array | number[],
  enrolledStudents: EnrolledStudent[],
  threshold: number = 0.55
): { student: EnrolledStudent; distance: number; confidence: number } | null {
  if (!enrolledStudents || enrolledStudents.length === 0) return null;

  let bestStudent: EnrolledStudent | null = null;
  let minDistance = Infinity;

  for (const student of enrolledStudents) {
    if (!student.descriptors || student.descriptors.length === 0) continue;

    for (const sampleDescriptor of student.descriptors) {
      const dist = computeEuclideanDistance(liveDescriptor, sampleDescriptor);
      if (dist < minDistance) {
        minDistance = dist;
        bestStudent = student;
      }
    }
  }

  if (bestStudent && minDistance <= threshold) {
    const confidence = Math.max(
      50,
      Math.min(99, Math.round((1 - minDistance / (threshold * 1.3)) * 100))
    );

    return {
      student: bestStudent,
      distance: minDistance,
      confidence,
    };
  }

  return null;
}

/**
 * Runs inference on a single image element (for enrollment preview)
 */
export async function extractFaceFromImage(
  imageElement: HTMLImageElement | HTMLCanvasElement
): Promise<{
  descriptor: number[];
  thumbnail: string;
  box: { x: number; y: number; width: number; height: number };
} | null> {
  const faceapi = await getFaceApi();
  if (!faceapi) return null;

  await loadModels();

  const detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;

  const { x, y, width, height } = detection.detection.box;
  const canvas = document.createElement('canvas');
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const padX = width * 0.15;
    const padY = height * 0.15;
    const srcX = Math.max(0, x - padX);
    const srcY = Math.max(0, y - padY);
    const srcW = width + padX * 2;
    const srcH = height + padY * 2;

    ctx.drawImage(imageElement, srcX, srcY, srcW, srcH, 0, 0, size, size);
  }

  const thumbnail = canvas.toDataURL('image/jpeg', 0.85);

  return {
    descriptor: Array.from(detection.descriptor),
    thumbnail,
    box: { x, y, width, height },
  };
}

/**
 * Runs real-time inference on a live video stream element
 */
export async function detectAllFacesInVideo(videoElement: HTMLVideoElement) {
  const faceapi = await getFaceApi();
  if (!faceapi || !modelsLoaded) return [];

  const detections = await faceapi
    .detectAllFaces(
      videoElement,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    )
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections;
}
