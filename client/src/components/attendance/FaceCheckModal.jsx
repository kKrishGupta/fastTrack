import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, ScanFace, ShieldCheck } from 'lucide-react';
import { useFaceEnrollmentCamera } from '../../hooks/useFaceEnrollmentCamera';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function FaceCheckModal({ onClose, onCapture }) {
  const videoRef = useRef(null);
  const captureLock = useRef(false);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const { analysis, captureFrame, modelError } = useFaceEnrollmentCamera({
    videoRef,
    pose: 'Front',
    enabled: Boolean(stream),
  });

  const stopCamera = () => stream?.getTracks().forEach((track) => track.stop());

  useEffect(() => {
    let active = true;
    let mediaStream;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(async (value) => {
      mediaStream = value;
      if (!active) return value.getTracks().forEach((track) => track.stop());
      setStream(value);
      videoRef.current.srcObject = value;
      await videoRef.current.play();
    }).catch(() => {
      if (active) setError('Camera permission is required for identity verification.');
    }).finally(() => active && setStarting(false));
    return () => {
      active = false;
      mediaStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = () => {
    if (captureLock.current) return;
    const result = captureFrame();
    if (!result) return;
    captureLock.current = true;
    stopCamera();
    onCapture(result);
  };

  useEffect(() => {
    if (!analysis.stable || captureLock.current) return undefined;
    const timer = window.setTimeout(capture, 650);
    return () => window.clearTimeout(timer);
  }, [analysis.stable]);

  const close = () => {
    stopCamera();
    onClose();
  };

  return (
    <Modal title="Verify your face" description="Look straight at the camera. One clear live image is encrypted and retained according to your organization policy." onClose={close} className="face-check-modal">
      <div className="face-check-camera">
        <video ref={videoRef} autoPlay muted playsInline />
        <div className={`face-check-guide ${analysis.valid ? 'is-ready' : ''}`}><ScanFace size={54} /></div>
        {starting && <div className="face-check-loading"><LoaderCircle className="spin" size={24} />Starting camera…</div>}
      </div>
      <div className={`capture-status ${analysis.stable ? 'capture-status--ready' : ''}`}>
        <ShieldCheck size={16} />{modelError || error || analysis.message}
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button variant="lime" onClick={capture} disabled={!stream || !analysis.stable || Boolean(modelError || error)}><Camera size={16} />{analysis.stable ? 'Capture and verify' : 'Hold still'}</Button>
      </div>
    </Modal>
  );
}
