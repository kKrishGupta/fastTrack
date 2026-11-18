import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Check, Eye, LoaderCircle, RotateCcw, ScanFace, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useFaceEnrollmentCamera } from '../../hooks/useFaceEnrollmentCamera';
import { enrollmentService } from '../../services/enrollmentService';

const poses = [
  { name: 'Front', instruction: 'Look straight at the camera' },
  { name: 'Left', instruction: 'Turn your head slightly left' },
  { name: 'Right', instruction: 'Turn your head slightly right' },
  { name: 'Up', instruction: 'Look slightly upward' },
  { name: 'Down', instruction: 'Look slightly downward' },
];

const poseGuides = {
  Front: { Icon: ScanFace, title: 'Face forward', detail: 'Center your nose and look at the lens.' },
  Left: { Icon: ArrowLeft, title: 'Slight left', detail: 'Move your nose a little left—not your shoulders.' },
  Right: { Icon: ArrowRight, title: 'Slight right', detail: 'Move your nose a little right—not your shoulders.' },
  Up: { Icon: ArrowUp, title: 'Chin slightly up', detail: 'Lift only your chin a little; keep looking at the screen.' },
  Down: { Icon: ArrowDown, title: 'Chin slightly down', detail: 'Lower only your chin a little; keep your back straight.' },
};

export function EnrollmentPage() {
  const videoRef = useRef(null);
  const captureLockRef = useRef(false);
  const { user, setUser } = useAuth();
  const [stream, setStream] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [adapter, setAdapter] = useState('');
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(null);
  const currentPose = poses[step]?.name ?? 'Front';
  const { analysis, captureFrame, modelError } = useFaceEnrollmentCamera({
    videoRef,
    pose: currentPose,
    enabled: Boolean(stream) && !finished && step < poses.length,
  });

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  const startCamera = async () => {
    setError('');
    setBusy(true);
    let mediaStream;
    try {
      const enrollment = await enrollmentService.start();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setSessionId(enrollment.sessionId);
      setAdapter(enrollment.adapter);
      setStream(mediaStream);
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play();
    } catch (requestError) {
      mediaStream?.getTracks().forEach((track) => track.stop());
      setError(requestError.code === 'FACE_MODEL_NOT_CONFIGURED'
        ? requestError.message
        : 'Camera enrollment could not start. Check camera permission and server connection.');
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    if (captureLockRef.current) return;
    const captureData = captureFrame();
    if (!captureData || !sessionId) return;
    captureLockRef.current = true;
    setAutoCountdown(null);
    setBusy(true);
    setError('');
    try {
      await enrollmentService.capture({ sessionId, pose: currentPose, ...captureData });
      setStep((current) => Math.min(poses.length, current + 1));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      captureLockRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!analysis.stable || !stream || !sessionId || busy || finished || step >= poses.length) {
      setAutoCountdown(null);
      return undefined;
    }

    setAutoCountdown(1);
    const captureTimer = window.setTimeout(() => capture(), 650);
    return () => {
      window.clearTimeout(captureTimer);
    };
  }, [analysis.stable, busy, finished, sessionId, step, stream]);

  const completeEnrollment = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await enrollmentService.complete(sessionId);
      setUser({ ...user, ...result.user });
      setFinished(true);
      stream?.getTracks().forEach((track) => track.stop());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setSessionId('');
    setAdapter('');
    setStep(0);
    setFinished(false);
    setAutoCountdown(null);
    setError('');
  };

  const allCaptured = step === poses.length;
  const statusMessage = modelError || error || (stream && !allCaptured ? analysis.message : '');
  const box = analysis.faceBox;
  const activeGuide = poseGuides[currentPose];
  const GuideIcon = activeGuide.Icon;

  return (
    <div className="enrollment-page page-enter">
      <div className="enrollment-topbar"><Link className="button button--secondary button--md" to="/employee"><ArrowLeft size={17} />Dashboard</Link><Badge tone={adapter === 'demo-capture-evidence' ? 'warning' : 'success'}><ShieldCheck size={14} />{adapter === 'demo-capture-evidence' ? 'Demo evidence mode' : 'Encrypted capture workflow'}</Badge></div>
      <header className="enrollment-heading"><p className="eyebrow">Guided enrollment</p><h1>Five angles. One secure profile.</h1><p>Each angle is accepted only after one clear, centered face holds the required pose.</p></header>
      <div className="enrollment-grid">
        <section className="camera-stage">
          <video ref={videoRef} autoPlay muted playsInline />
          <div className="camera-stage__shade" />
          {stream && !allCaptured && <div className={`camera-pose-guide camera-pose-guide--${currentPose.toLowerCase()} ${analysis.valid ? 'camera-pose-guide--ready' : ''}`}><span><GuideIcon size={25} /></span><div><strong>{activeGuide.title}</strong><small>{activeGuide.detail}</small></div></div>}
          {autoCountdown && <div className="auto-capture-countdown" aria-live="polite"><Camera size={20} /><strong>{autoCountdown}</strong><span>Hold still</span></div>}
          {box && stream && !allCaptured && <div className={`detected-face ${analysis.valid ? 'detected-face--valid' : ''}`} style={{ left: `${(1 - box.left - box.width) * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
          <div className={`face-guide ${analysis.valid ? 'face-guide--valid' : ''} ${allCaptured ? 'face-guide--complete' : ''}`}><span /><span /><span /><span /></div>
          {!stream && !finished && <div className="camera-stage__start"><span><Camera size={26} /></span><h2>Camera is off</h2><p>Frames are processed only for enrollment.</p><Button variant="lime" onClick={startCamera} disabled={busy || Boolean(modelError)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Eye size={17} />}Enable camera</Button></div>}
          {finished && <div className="camera-stage__start"><span><Check size={26} /></span><h2>Enrollment saved</h2><p>Your five validated captures were submitted securely.</p><Link className="button button--lime button--md" to="/employee">Return to dashboard</Link></div>}
          {stream && !finished && <div className={`camera-instruction ${analysis.stable ? 'camera-instruction--ready' : ''}`}><span>{allCaptured ? <Check size={18} /> : step + 1}</span><p>{allCaptured ? 'All five angles captured' : analysis.message || poses[step].instruction}</p></div>}
        </section>
        <aside className="pose-panel">
          <div className="pose-panel__progress"><span>Enrollment progress</span><strong>{Math.round((step / poses.length) * 100)}%</strong></div>
          <div className="progress progress--dark"><span style={{ width: `${(step / poses.length) * 100}%` }} /></div>
          <div className="pose-list">
            {poses.map((pose, index) => <div className={`pose-item ${index === step ? 'pose-item--active' : ''} ${index < step ? 'pose-item--complete' : ''}`} key={pose.name}><span>{index < step ? <Check size={16} /> : index + 1}</span><div><strong>{pose.name}</strong><p>{pose.instruction}</p></div></div>)}
          </div>
          {statusMessage && <div className={error || modelError ? 'form-alert' : `capture-status ${analysis.stable ? 'capture-status--ready' : ''}`}>{statusMessage}</div>}
          {analysis.metrics && stream && !allCaptured && <p className="pose-metrics">Yaw {analysis.metrics.yaw.toFixed(0)}° · Pitch {analysis.metrics.pitch.toFixed(0)}° · Light {analysis.metrics.brightness.toFixed(0)} · Focus {analysis.metrics.sharpness.toFixed(1)}</p>}
          <div className="pose-actions">
            <Button variant="secondary" onClick={reset} disabled={busy || (!stream && !step)}><RotateCcw size={16} />Reset</Button>
            {!allCaptured && <Button variant="lime" onClick={capture} disabled={!stream || !analysis.stable || busy || Boolean(modelError)}>{busy && <LoaderCircle className="spin" size={16} />}{autoCountdown ? `Auto capture in ${autoCountdown}` : 'Hold pose to auto capture'}</Button>}
            {allCaptured && !finished && <Button variant="lime" onClick={completeEnrollment} disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}Complete enrollment</Button>}
          </div>
          <p className="pose-note">{adapter === 'demo-capture-evidence' ? 'Demo mode validates pose and image quality, then stores encrypted capture evidence. It is not biometric identity recognition.' : 'Development mode stores encrypted capture evidence but is not identity recognition. Configure a maintained server-side embedding provider before using facial identity verification in production.'}</p>
        </aside>
      </div>
    </div>
  );
}
