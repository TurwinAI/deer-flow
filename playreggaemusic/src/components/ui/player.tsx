/**
 * Inline audio player (the signature interactive feature). A single global
 * <audio> element + a persistent docked "now playing" bar. Play buttons on
 * release tiles and track rows enqueue/toggle playback in place — the catalog
 * stays put while audio plays, the way a real label site behaves.
 *
 * Works with real preview URLs in production. In the offline fixtures demo the
 * preview files may not resolve, so progress falls back to a simulated 30s
 * timeline — the bar, controls, and equalizer stay alive and demonstrable.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface PlayerTrack {
  id: string;
  title: string;
  subtitle?: string;
  src: string;
}

interface PlayerState {
  track: PlayerTrack | null;
  playing: boolean;
  current: number;
  duration: number;
  play: (track: PlayerTrack) => void;
  toggle: () => void;
  seek: (fraction: number) => void;
}

/** No-op default so components render outside a provider (e.g. in unit tests);
 *  the real app wraps <App> in <PlayerProvider> (main.tsx). */
const DEFAULT: PlayerState = {
  track: null,
  playing: false,
  current: 0,
  duration: 0,
  play: () => {},
  toggle: () => {},
  seek: () => {},
};

const Ctx = createContext<PlayerState>(DEFAULT);

export function usePlayer(): PlayerState {
  return useContext(Ctx);
}

const SIM_DURATION = 30; // fallback timeline (s) when no real audio resolves

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // Reserve space for the docked bar so it never covers content.
  useEffect(() => {
    document.body.classList.toggle("has-player", Boolean(track));
    return () => document.body.classList.remove("has-player");
  }, [track]);

  // Simulated progress for the offline demo (when the audio element can't load).
  useEffect(() => {
    if (!playing) return;
    const el = audioRef.current;
    const hasRealAudio = el && Number.isFinite(el.duration) && el.duration > 0;
    if (hasRealAudio) return;
    setDuration(SIM_DURATION);
    const id = window.setInterval(() => {
      setCurrent((c) => {
        if (c >= SIM_DURATION) {
          setPlaying(false);
          return 0;
        }
        return c + 0.25;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, track]);

  const play = useCallback((next: PlayerTrack) => {
    setTrack((prev) => {
      const same = prev?.id === next.id;
      if (!same) setCurrent(0);
      return next;
    });
    setPlaying(true);
    // Defer so the <audio src> updates before play().
    window.setTimeout(() => {
      const el = audioRef.current;
      if (el) el.play().catch(() => {/* offline fixtures: simulated timeline */});
    }, 0);
  }, []);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      const el = audioRef.current;
      if (el) {
        if (p) el.pause();
        else el.play().catch(() => {});
      }
      return !p;
    });
  }, []);

  const seek = useCallback(
    (fraction: number) => {
      const el = audioRef.current;
      const dur = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : SIM_DURATION;
      const t = Math.max(0, Math.min(1, fraction)) * dur;
      setCurrent(t);
      if (el && Number.isFinite(el.duration)) el.currentTime = t;
    },
    [],
  );

  return (
    <Ctx.Provider value={{ track, playing, current, duration, play, toggle, seek }}>
      {children}
      <audio
        ref={audioRef}
        src={track?.src}
        preload="none"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setCurrent(el.currentTime);
            setDuration(el.duration);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <NowPlayingBar />
    </Ctx.Provider>
  );
}

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  return `${m}:${sec}`;
}

/** Animated bars shown when a track is playing. */
export function Equalizer({ active }: { active: boolean }) {
  return (
    <span className={active ? "eq eq--on" : "eq"} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

/** Round play/pause control for a given track (tiles, track rows). */
export function PlayButton({ track, label }: { track: PlayerTrack; label: string }) {
  const { track: cur, playing, play, toggle } = usePlayer();
  const isCurrent = cur?.id === track.id;
  const isPlaying = isCurrent && playing;
  return (
    <button
      type="button"
      className={isPlaying ? "play-btn is-playing" : "play-btn"}
      aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={isPlaying}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isCurrent) toggle();
        else play(track);
      }}
    >
      {isPlaying ? <Equalizer active /> : <span className="play-btn__tri" aria-hidden="true" />}
    </button>
  );
}

function NowPlayingBar() {
  const { track, playing, current, duration, toggle, seek } = usePlayer();
  if (!track) return null;
  const pct = duration > 0 ? (current / duration) * 100 : 0;
  return (
    <div className="nowplaying" role="region" aria-label="Now playing">
      <div className="nowplaying__inner container container--wide">
        <button
          type="button"
          className="nowplaying__toggle"
          aria-label={playing ? "Pause" : "Play"}
          onClick={toggle}
        >
          {playing ? <Equalizer active /> : <span className="play-btn__tri" aria-hidden="true" />}
        </button>
        <div className="nowplaying__meta">
          <span className="nowplaying__title">{track.title}</span>
          {track.subtitle && <span className="nowplaying__sub">{track.subtitle}</span>}
        </div>
        <span className="nowplaying__time">{fmt(current)}</span>
        <button
          type="button"
          className="nowplaying__scrub"
          aria-label="Seek"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - r.left) / r.width);
          }}
        >
          <span className="nowplaying__bar" style={{ width: `${pct}%` }} />
        </button>
        <span className="nowplaying__time">{fmt(duration)}</span>
      </div>
    </div>
  );
}
