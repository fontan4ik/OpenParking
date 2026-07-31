'use client';

import { useRef, useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

type AssistantRecommendation = {
  readonly sourceId: string;
  readonly name: string;
  readonly hourlyRate: number;
  readonly trust: string;
  readonly sourceName: string;
};

type AssistantResponse = {
  readonly reply?: string;
  readonly error?: string;
  readonly recommendations?: readonly AssistantRecommendation[];
};

type AssistantStatus = 'idle' | 'thinking' | 'listening' | 'transcribing' | 'error';

type ParkingAssistantProps = {
  readonly city: string;
  readonly onRecommendationSelect: (sourceId: string) => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function ParkingAssistant({ city, onRecommendationSelect }: ParkingAssistantProps) {
  const { locale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [recommendations, setRecommendations] = useState<readonly AssistantRecommendation[]>([]);
  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [error, setError] = useState('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const sourceSampleRateRef = useRef(16_000);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const text = locale === 'ru'
    ? {
        title: 'Помощник по парковке', placeholder: 'Например: найди недорогую парковку у Ocean Drive', send: 'Спросить', listen: 'Голосовой запрос', stop: 'Остановить запись', thinking: 'Подбираем варианты...', transcribing: 'Распознаем голос локально...', unavailable: 'Микрофон недоступен. Проверьте разрешение браузера.', helper: 'Помогу выбрать недорогую парковку, построить маршрут и спланировать поездку.', open: 'Открыть AI-помощника', choose: 'Открыть и построить маршрут', source: 'Источник',
      }
    : {
        title: 'Parking assistant', placeholder: 'For example: find affordable parking near Ocean Drive', send: 'Ask', listen: 'Voice query', stop: 'Stop recording', thinking: 'Finding options...', transcribing: 'Transcribing locally...', unavailable: 'Microphone access is unavailable. Check your browser permission.', helper: 'I can find affordable parking, help build a route, and plan a stop.', open: 'Open AI assistant', choose: 'Open and route', source: 'Source',
      };

  const stopAudioCapture = () => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const askAssistant = async (question: string) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    setStatus('thinking');
    setError('');
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedQuestion, city }),
      });
      const body = (await response.json()) as AssistantResponse;
      setRecommendations(body.recommendations ?? []);
      if (!response.ok || !body.reply) {
        setError(body.error ?? 'The parking assistant could not complete that request.');
        return;
      }
      setReply(body.reply);
    } catch (requestError) {
      if (isAbortError(requestError)) return;
      setError('The parking assistant could not complete that request.');
    } finally {
      setStatus('idle');
    }
  };

  const startListening = async () => {
    if (status === 'listening') {
      setStatus('transcribing');
      stopAudioCapture();
      try {
        const { pipeline } = await import('@huggingface/transformers');
        const samples = resampleTo16Khz(concatenateAudio(audioChunksRef.current), sourceSampleRateRef.current);
        if (samples.length === 0) {
          setError(text.unavailable);
          return;
        }
        const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
        const transcription = await transcriber(samples, {
          language: locale === 'ru' ? 'russian' : 'english',
          task: 'transcribe',
        });
        const transcript = typeof transcription.text === 'string' ? transcription.text.trim() : '';
        if (!transcript) {
          setError(text.unavailable);
          return;
        }
        setMessage(transcript);
        await askAssistant(transcript);
      } catch (transcriptionError) {
        if (!isAbortError(transcriptionError)) setError(text.unavailable);
      } finally {
        setStatus('idle');
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioChunksRef.current = [];
      sourceSampleRateRef.current = audioContext.sampleRate;
      processor.onaudioprocess = (event) => {
        audioChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      processorRef.current = processor;
      setError('');
      setStatus('listening');
    } catch (microphoneError) {
      if (!isAbortError(microphoneError)) setError(text.unavailable);
    }
  };

  return (
    <section className="parking-assistant" aria-label={text.title}>
      <button className="parking-assistant-trigger" type="button" aria-expanded={isOpen} aria-controls="parking-assistant-panel" onClick={() => setIsOpen((open) => !open)} title={text.open}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5Z" /><path d="M4 11a8 8 0 0 0 16 0M12 19v3M8 22h8" /></svg>
      </button>
      {isOpen && (
        <div className="parking-assistant-panel" id="parking-assistant-panel">
          <div className="parking-assistant-heading"><div><strong>{text.title}</strong><span>{text.helper}</span></div><span className="parking-assistant-local">Whisper</span></div>
          <form className="parking-assistant-form" onSubmit={(event) => { event.preventDefault(); void askAssistant(message); }}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={text.placeholder} maxLength={1000} />
            <button className="parking-assistant-voice" type="button" onClick={() => void startListening()} aria-label={status === 'listening' ? text.stop : text.listen} title={status === 'listening' ? text.stop : text.listen}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></svg>
            </button>
            <button className="parking-assistant-send" type="submit" disabled={status === 'thinking' || status === 'transcribing'}>{text.send}</button>
          </form>
          {(status === 'thinking' || status === 'transcribing') && <p className="parking-assistant-status">{status === 'thinking' ? text.thinking : text.transcribing}</p>}
          {error && <p className="parking-assistant-error">{error}</p>}
          {reply && <p className="parking-assistant-reply">{reply}</p>}
          {recommendations.length > 0 && <div className="parking-assistant-recommendations">{recommendations.map((recommendation) => <button key={recommendation.sourceId} type="button" onClick={() => onRecommendationSelect(recommendation.sourceId)}><strong>{recommendation.name}</strong><span>${recommendation.hourlyRate}/hr · {recommendation.trust}</span><small>{text.source}: {recommendation.sourceName} · {text.choose}</small></button>)}</div>}
        </div>
      )}
    </section>
  );
}

function concatenateAudio(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resampleTo16Khz(samples: Float32Array, sourceSampleRate: number): Float32Array {
  if (sourceSampleRate === 16_000) return samples;
  const targetLength = Math.round((samples.length * 16_000) / sourceSampleRate);
  const target = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = Math.min(Math.floor((index * sourceSampleRate) / 16_000), samples.length - 1);
    target[index] = samples[sourceIndex];
  }
  return target;
}
