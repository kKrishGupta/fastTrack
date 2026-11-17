import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const emptyAnalysis = {
  ready: false,
  valid: false,
  message: 'Starting face detector…',
  faceBox: null,
  metrics: null,
};

function rotationFromMatrix(matrix) {
  const m = matrix?.data;
  if (!m || m.length < 16) return { yaw: 0, pitch: 0, roll: 0 };
  const degrees = (radians) => radians * 180 / Math.PI;
  return {
    pitch: degrees(Math.atan2(m[9], m[10])),
    yaw: degrees(Math.atan2(-m[8], Math.hypot(m[9], m[10]))),
    roll: degrees(Math.atan2(m[4], m[0])),
  };
}

function measureImage(video, canvas, faceBox) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 160;
  canvas.height = 90;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const luminance = new Float32Array(canvas.width * canvas.height);
  for (let pixel = 0, offset = 0; offset < data.length; pixel += 1, offset += 4) {
    luminance[pixel] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  // Measure the detected face, not the mostly smooth wall/background. Laptop webcams
  // otherwise report a false blur warning even when eyes and facial features are clear.
  const left = Math.max(1, Math.floor(faceBox.left * canvas.width));
  const right = Math.min(canvas.width - 2, Math.ceil((faceBox.left + faceBox.width) * canvas.width));
  const top = Math.max(1, Math.floor(faceBox.top * canvas.height));
  const bottom = Math.min(canvas.height - 2, Math.ceil((faceBox.top + faceBox.height) * canvas.height));
  let brightness = 0;
  let sharpness = 0;
  let pixels = 0;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * canvas.width + x;
      brightness += luminance[index];
      // A small Sobel-like gradient is much more reliable than comparing adjacent
      // pixels across the entire frame and is inexpensive enough for live video.
      sharpness += Math.abs(luminance[index + 1] - luminance[index - 1])
        + Math.abs(luminance[index + canvas.width] - luminance[index - canvas.width]);
      pixels += 1;
    }
  }
  return { brightness: brightness / pixels, sharpness: sharpness / (pixels * 2) };
}

function stabilizedImageQuality(current, history) {
  history.push(current);
  if (history.length > 5) history.shift();
  const median = (key) => {
    const values = history.map((item) => item[key]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return { brightness: median('brightness'), sharpness: median('sharpness') };
}

function poseIsValid(pose, { yaw, pitch, roll }) {
  if (Math.abs(roll) > 22) return false;
  switch (pose) {
    case 'Front': return Math.abs(yaw) < 13 && Math.abs(pitch) < 14;
    // The preview is mirrored, so MediaPipe's matrix signs are reversed from the
    // direction the employee sees on screen.
    case 'Left': return yaw < -7 && yaw > -32 && Math.abs(pitch) < 20;
    case 'Right': return yaw > 7 && yaw < 32 && Math.abs(pitch) < 20;
    case 'Up': return pitch > 6 && pitch < 28 && Math.abs(yaw) < 20;
    case 'Down': return pitch < -6 && pitch > -28 && Math.abs(yaw) < 20;
    default: return false;
  }
}

function poseCorrection(pose, { yaw, pitch, roll }) {
  if (Math.abs(roll) > 22) return 'Keep your head upright—do not tilt it sideways.';
  switch (pose) {
    case 'Front':
      if (yaw > 13) return 'Turn slightly right until your nose is centered.';
      if (yaw < -13) return 'Turn slightly left until your nose is centered.';
      if (pitch > 14) return 'Raise your chin slightly.';
      return 'Lower your chin slightly.';
    case 'Left':
      if (yaw >= -7) return 'Move your nose only a little toward the left arrow.';
      if (yaw <= -32) return 'Come back slightly—you turned too far left.';
      return 'Perfect—hold this slight left turn.';
    case 'Right':
      if (yaw <= 7) return 'Move your nose only a little toward the right arrow.';
      if (yaw >= 32) return 'Come back slightly—you turned too far right.';
      return 'Perfect—hold this slight right turn.';
    case 'Up':
      if (pitch <= 6) return 'Lift your chin just a little—do not move your whole body.';
      if (pitch >= 28) return 'Lower your chin slightly—you are looking too high.';
      return 'Perfect—hold your chin slightly up.';
    case 'Down':
      if (pitch >= -6) return 'Lower your chin just a little—keep your back straight.';
      if (pitch <= -28) return 'Raise your chin slightly—you are looking too low.';
      return 'Perfect—hold your chin slightly down.';
    default: return 'Follow the direction shown on the camera.';
  }
}

function analyzeResult(result, video, canvas, pose, qualityHistory) {
  const faces = result.faceLandmarks ?? [];
  if (faces.length !== 1) {
    return { ...emptyAnalysis, ready: true, message: faces.length ? 'Only one face may be visible.' : 'Place your face inside the guide.' };
  }

  const landmarks = faces[0];
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const left = Math.max(0, Math.min(...xs));
  const right = Math.min(1, Math.max(...xs));
  const top = Math.max(0, Math.min(...ys));
  const bottom = Math.min(1, Math.max(...ys));
  const width = right - left;
  const height = bottom - top;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const rotation = rotationFromMatrix(result.facialTransformationMatrixes?.[0]);
  const faceBox = { left, top, width, height };
  const image = stabilizedImageQuality(measureImage(video, canvas, faceBox), qualityHistory);
  const metrics = { ...rotation, ...image };

  if (width < 0.15 || height < 0.24) return { ready: true, valid: false, message: 'Move a little closer to the camera.', faceBox, metrics };
  if (width > 0.72 || height > 0.88) return { ready: true, valid: false, message: 'Move slightly away from the camera.', faceBox, metrics };
  if (Math.abs(centerX - 0.5) > 0.19 || Math.abs(centerY - 0.5) > 0.21) return { ready: true, valid: false, message: 'Center your face inside the guide.', faceBox, metrics };
  if (image.brightness < 45) return { ready: true, valid: false, message: 'The image is too dark. Face a light source.', faceBox, metrics };
  if (image.brightness > 235) return { ready: true, valid: false, message: 'The image is overexposed. Reduce direct light.', faceBox, metrics };
  if (image.sharpness < 2.7) return { ready: true, valid: false, message: 'Image is still soft—clean the lens or add more light.', faceBox, metrics };
  if (!poseIsValid(pose, rotation)) return { ready: true, valid: false, message: poseCorrection(pose, rotation), faceBox, metrics };
  return { ready: true, valid: true, message: 'Good position—hold still.', faceBox, metrics };
}

export function useFaceEnrollmentCamera({ videoRef, pose, enabled }) {
  const detectorRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const frameRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectionAtRef = useRef(0);
  const validSinceRef = useRef(null);
  const qualityHistoryRef = useRef([]);
  const [analysis, setAnalysis] = useState(emptyAnalysis);
  const [modelError, setModelError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const files = await FilesetResolver.forVisionTasks(WASM_ROOT);
        const options = {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 2,
          minFaceDetectionConfidence: 0.65,
          minFacePresenceConfidence: 0.65,
          minTrackingConfidence: 0.65,
          outputFacialTransformationMatrixes: true,
        };
        let detector;
        try {
          detector = await FaceLandmarker.createFromOptions(files, options);
        } catch {
          detector = await FaceLandmarker.createFromOptions(files, {
            ...options,
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          });
        }
        if (cancelled) detector.close();
        else detectorRef.current = detector;
      } catch {
        if (!cancelled) setModelError('Face detector could not load. Check your internet connection and reload.');
      }
    }
    load();
    return () => {
      cancelled = true;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAnalysis(emptyAnalysis);
      validSinceRef.current = null;
      return undefined;
    }
    validSinceRef.current = null;
    qualityHistoryRef.current = [];
    setAnalysis({ ...emptyAnalysis, message: `Prepare the ${pose.toLowerCase()} angle…` });
    const tick = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      const now = performance.now();
      if (video?.readyState >= 2 && detector && video.currentTime !== lastVideoTimeRef.current && now - lastDetectionAtRef.current >= 80) {
        lastVideoTimeRef.current = video.currentTime;
        lastDetectionAtRef.current = now;
        const next = analyzeResult(detector.detectForVideo(video, now), video, canvasRef.current, pose, qualityHistoryRef.current);
        if (next.valid) {
          validSinceRef.current ??= now;
          next.stable = now - validSinceRef.current >= 350;
          if (!next.stable) next.message = 'Good position—keep holding still.';
        } else {
          validSinceRef.current = null;
          next.stable = false;
        }
        setAnalysis(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [enabled, pose, videoRef]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !analysis.valid || !analysis.stable) return null;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 720 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      frame: canvas.toDataURL('image/jpeg', 0.82),
      quality: {
        brightness: Math.round(analysis.metrics.brightness),
        sharpness: Number(analysis.metrics.sharpness.toFixed(2)),
        yaw: Number(analysis.metrics.yaw.toFixed(1)),
        pitch: Number(analysis.metrics.pitch.toFixed(1)),
        roll: Number(analysis.metrics.roll.toFixed(1)),
      },
    };
  }, [analysis, videoRef]);

  return { analysis, captureFrame, modelError };
}
