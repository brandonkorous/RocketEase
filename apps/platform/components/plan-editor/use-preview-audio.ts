"use client";

/*
 * The preview's audio mix — an APPROXIMATION, and labeled as one in the UI.
 * The real mix is sidechain compression and loudness normalisation in ffmpeg
 * (lib/media/video/audio.ts); this is two <audio> elements whose volumes
 * follow the same plan numbers, so a person hears roughly what the bed and
 * the duck will do before any render runs.
 */
import { useEffect, useRef } from "react";

const dbToGain = (db: number) => Math.min(1, 10 ** (db / 20));

export type PreviewAudioInput = {
  video: HTMLVideoElement | null;
  voiceUrl: string | null;
  musicUrl: string | null;
  musicGainDb: number;
  duckDb: number;
};

export function usePreviewAudio({ video, voiceUrl, musicUrl, musicGainDb, duckDb }: PreviewAudioInput) {
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!video) return;
    const voice = voiceUrl ? new Audio(voiceUrl) : null;
    const music = musicUrl ? new Audio(musicUrl) : null;
    if (music) music.loop = true;
    voiceRef.current = voice;
    musicRef.current = music;

    const applyVolumes = () => {
      if (!music) return;
      const voiceSpeaking = Boolean(voice && !voice.paused && !voice.ended);
      music.volume = dbToGain(musicGainDb - (voiceSpeaking ? duckDb : 0));
    };

    const onPlay = () => {
      voice?.play().catch(() => {});
      music?.play().catch(() => {});
      applyVolumes();
    };
    const onPause = () => {
      voice?.pause();
      music?.pause();
    };
    const onSeek = () => {
      if (voice) voice.currentTime = video.currentTime;
      if (music) music.currentTime = video.currentTime % (music.duration || 1);
    };
    const tick = setInterval(applyVolumes, 250);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    return () => {
      clearInterval(tick);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      voice?.pause();
      music?.pause();
    };
  }, [video, voiceUrl, musicUrl, musicGainDb, duckDb]);
}
