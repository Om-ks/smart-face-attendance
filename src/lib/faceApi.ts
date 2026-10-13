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
 * Loads the face detection, landmark, and recognition weights.
 * MUST include trailing slash for correct relative shard (.bin) resolution!
 */
export async function loadModels(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (modelsLoaded) return true;
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    const faceapi = await getFaceApi();
    if (!faceapi) return false;

    // Notice trailing slashes are mandatory for relative .bin shard resolution
    const sources = [
      'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/',
      '/models/',
      'https://raw.githubusercontent.com/vladmandic/face-api/master/model/',
    ];

    for (const src of sources) {
      try {
        console.log(`Loading Face-API models from: ${src}`);
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(src),
          faceapi.nets.tinyFaceDetector.loadFromUri(src),
          faceapi.nets.faceLandmark68Net.loadFromUri(src),
          faceapi.nets.faceRecognitionNet.loadFromUri(src),
        ]);

        modelsLoaded = true;
        console.log(`Successfully loaded Face-API models from: ${src}`);
        return true;
      } catch (err) {
        console.warn(`Model load from ${src} failed, trying next mirror...`, err);
      }
    }

    modelsLoaded = false;
    return false;
  })();

  try {
    const result = await modelsLoadingPromise;
    return result;
  } finally {
    modelsLoadingPromise = null;
  }
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Normalizes and resizes any image to an HTMLCanvasElement (max dimension 800px)
 * to prevent GPU/WebGL memory overflow and handle large phone camera photos
 */
export function imageToCanvas(img: HTMLImageElement, maxDim = 800): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let width = img.naturalWidth || img.width || 640;
  let height = img.naturalHeight || img.height || 480;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
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
 * Uses generous threshold 0.65 to ensure high recognition rate in variable camera lighting
 */
export function findBestMatch(
  liveDescriptor: Float32Array | number[],
  enrolledStudents: EnrolledStudent[],
  threshold: number = 0.65
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
      60,
      Math.min(99, Math.round((1 - minDistance / (threshold * 1.25)) * 100))
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
 * Ultra-robust face extraction with 4 progressive detection fallbacks
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

  const ready = await loadModels();
  if (!ready) {
    throw new Error('AI models are still loading. Please check your internet connection.');
  }

  const canvas = imageElement instanceof HTMLImageElement ? imageToCanvas(imageElement) : imageElement;
  let detection: any = null;

  // Attempt 1: SSD MobileNet with forgiving confidence
  try {
    detection = await faceapi
      .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  } catch (e) {
    console.warn('SSD MobileNet pass failed, falling back to TinyFaceDetector...', e);
  }

  // Attempt 2: Tiny Face Detector (512px)
  if (!detection && faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      detection = await faceapi
        .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.15 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    } catch (e) {
      console.warn('TinyFace pass 1 failed...', e);
    }
  }

  // Attempt 3: Tiny Face Detector with smaller input size
  if (!detection && faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      detection = await faceapi
        .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.1 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    } catch (e) {
      console.warn('TinyFace pass 2 failed...', e);
    }
  }

  // Attempt 4: Scan all faces and pick the largest one
  if (!detection && faceapi.nets.tinyFaceDetector.isLoaded) {
    try {
      const allDetections = await faceapi
        .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.1 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (allDetections && allDetections.length > 0) {
        allDetections.sort(
          (a: any, b: any) =>
            b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height
        );
        detection = allDetections[0];
      }
    } catch (e) {
      console.warn('Fallback multi-face search failed...', e);
    }
  }

  if (!detection) return null;

  // Crop square avatar thumbnail
  const { x, y, width, height } = detection.detection.box;
  const thumbCanvas = document.createElement('canvas');
  const size = 180;
  thumbCanvas.width = size;
  thumbCanvas.height = size;
  const ctx = thumbCanvas.getContext('2d');

  if (ctx) {
    const padX = width * 0.18;
    const padY = height * 0.18;
    const srcX = Math.max(0, x - padX);
    const srcY = Math.max(0, y - padY);
    const srcW = Math.min(canvas.width - srcX, width + padX * 2);
    const srcH = Math.min(canvas.height - srcY, height + padY * 2);

    ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, size, size);
  }

  const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.9);

  return {
    descriptor: Array.from(detection.descriptor),
    thumbnail,
    box: { x, y, width, height },
  };
}

/**
 * Real-time video detection tuned for live webcams:
 * Uses fast TinyFaceDetector (320px, scoreThreshold 0.15) with SSD MobileNet fallback
 */
export async function detectAllFacesInVideo(videoElement: HTMLVideoElement) {
  const faceapi = await getFaceApi();
  if (!faceapi || !modelsLoaded) return [];

  try {
    // Primary: TinyFaceDetector (super fast and responsive on mobile/laptop webcams)
    let detections = await faceapi
      .detectAllFaces(
        videoElement,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 })
      )
      .withFaceLandmarks()
      .withFaceDescriptors();

    // Fallback: SSD MobileNet with relaxed confidence
    if (!detections || detections.length === 0) {
      detections = await faceapi
        .detectAllFaces(
          videoElement,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();
    }

    return detections || [];
  } catch (err) {
    console.warn('Video detection frame error:', err);
    return [];
  }
}
