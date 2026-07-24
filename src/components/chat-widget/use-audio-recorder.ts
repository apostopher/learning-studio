import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_MS = 90_000;
const TRANSCRIBE_ENDPOINT = '/api/chat/transcribe';

export type AudioRecorderError =
  | 'permission-denied'
  | 'no-microphone'
  | 'transcription-failed'
  | 'too-long'
  | 'other'
  | null;

export interface UseAudioRecorderResult {
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  final: string;
  error: AudioRecorderError;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  reset: () => void;
}

export function detectMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm';
  }
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  return '';
}

export async function transcribeAudio(
  blob: Blob,
  ext: string,
  signal: AbortSignal,
): Promise<string> {
  const formData = new FormData();
  formData.append('audio', blob, `speech.${ext}`);
  const response = await fetch(TRANSCRIBE_ENDPOINT, {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!response.ok) throw new Error('transcription-failed');
  const data = (await response.json()) as { transcript?: string };
  return data.transcript ?? '';
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [final, setFinal] = useState('');
  const [error, setError] = useState<AudioRecorderError>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mimeTypeRef = useRef<string>('');
  const startingRef = useRef(false);
  const discardRef = useRef(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    );
  }, []);

  const releaseMedia = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  const transcribeChunks = useCallback(async () => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) {
      setIsTranscribing(false);
      return;
    }
    const blob = new Blob(chunks, {
      type: mimeTypeRef.current || 'audio/webm',
    });
    const ext = mimeTypeRef.current.includes('mp4') ? 'mp4' : 'webm';

    abortRef.current = new AbortController();
    try {
      const transcript = await transcribeAudio(
        blob,
        ext,
        abortRef.current.signal,
      );
      setFinal(transcript);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('transcription-failed');
    } finally {
      abortRef.current = null;
      setIsTranscribing(false);
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else if (startingRef.current) {
      // getUserMedia still pending — nothing was captured; discard on arrival.
      discardRef.current = true;
      setIsRecording(false);
    } else {
      releaseMedia();
      setIsRecording(false);
    }
  }, [releaseMedia]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsTranscribing(false);
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop consumes discardRef and skips transcription
    } else if (startingRef.current) {
      // start() is awaiting getUserMedia; it will consume discardRef and bail.
      setIsRecording(false);
    } else {
      releaseMedia();
      setIsRecording(false);
      discardRef.current = false;
    }
  }, [releaseMedia]);

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    startingRef.current = true;
    discardRef.current = false;
    // Cancel any in-flight transcription from a previous round so that
    // isRecording and isTranscribing are never both true simultaneously.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsTranscribing(false);
    }
    setFinal('');
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('permission-denied');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('no-microphone');
      } else {
        setError('other');
      }
      startingRef.current = false;
      discardRef.current = false;
      return;
    }

    // A release (cancel or stop) may have arrived while getUserMedia was
    // pending (e.g. the permission prompt was open). Discard and bail.
    if (discardRef.current) {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
      discardRef.current = false;
      startingRef.current = false;
      setIsRecording(false);
      return;
    }

    const mimeType = detectMimeType();
    mimeTypeRef.current = mimeType;
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      releaseMedia();
      setIsRecording(false);
      if (discardRef.current) {
        discardRef.current = false;
        chunksRef.current = [];
        return;
      }
      setIsTranscribing(true);
      void transcribeChunks();
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    timerRef.current = setTimeout(() => {
      setError('too-long');
      stop();
    }, MAX_RECORDING_MS);

    recorder.start();
    setIsRecording(true);
    startingRef.current = false;
  }, [releaseMedia, stop, transcribeChunks]);

  const reset = useCallback(() => {
    setFinal('');
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          t.stop();
        });
        streamRef.current = null;
      }
      recorderRef.current = null;
    };
  }, []);

  return {
    isSupported,
    isRecording,
    isTranscribing,
    final,
    error,
    start,
    stop,
    cancel,
    reset,
  };
}
