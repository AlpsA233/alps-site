"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PrintInk } from "@/components/print-title";
import { useMotionPreference } from "@/components/use-motion-preference";
import { WeatherParticles } from "@/components/weather-particles";
import {
  fetchWeather,
  formatPlaceLabel,
  hasAskedForPlace,
  markAskedForPlace,
  readSavedPlace,
  requestVisitorPlace,
  splitTemperature,
  writeSavedPlace,
  type SavedPlace,
  type TemperatureParts,
  type WeatherIcon,
  type WeatherReading,
} from "@/lib/weather";
import "./weather-desk.css";

type Phase =
  "idle" | "locating" | "reading" | "ready" | "denied" | "unavailable";

type PhaseCopy = { zh: string; en: string; hand: string };

const PHASE_COPY: Record<Exclude<Phase, "ready">, PhaseCopy> = {
  idle: {
    zh: "等待定位",
    en: "WAITING FOR YOU",
    hand: "one look, only here.",
  },
  locating: {
    zh: "正在校准",
    en: "CALIBRATING",
    hand: "looking up…",
  },
  reading: {
    zh: "读取天空",
    en: "READING THE SKY",
    hand: "hold on a moment.",
  },
  denied: {
    zh: "定位关闭",
    en: "LOCATION OFF",
    hand: "no sky today.",
  },
  unavailable: {
    zh: "未连接",
    en: "OFFLINE",
    hand: "the sky is quiet.",
  },
};

type Status = { text: string; live: boolean };

function statusFor(phase: Phase, reading: WeatherReading | null): Status {
  if (phase === "ready" && reading)
    return { text: `LIVE · ${clockLabel(reading.time) || "NOW"}`, live: true };
  if (phase === "locating") return { text: "CALIBRATING / 校准中", live: true };
  if (phase === "reading") return { text: "READING / 读取中", live: true };
  if (phase === "denied") return { text: "OFF / 定位未开启", live: false };
  if (phase === "unavailable") return { text: "OFF / 未连接", live: false };
  return { text: "WAITING / 待定位", live: false };
}

function clockLabel(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match ? match[1] : "";
}

async function geolocationPermission(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query)
    return "unknown";
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state as "granted" | "denied" | "prompt";
  } catch {
    return "unknown";
  }
}

const GLYPH_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function glyph(i: number, extra?: string) {
  return {
    pathLength: 1,
    className: extra ? `wd-glyph ${extra}` : "wd-glyph",
    style: { "--i": i } as CSSProperties,
  } as const;
}

function WeatherGlyph({ icon }: { icon: WeatherIcon }) {
  const rays = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    return {
      x1: 32 + Math.cos(angle) * 17,
      y1: 32 + Math.sin(angle) * 17,
      x2: 32 + Math.cos(angle) * 25,
      y2: 32 + Math.sin(angle) * 25,
    };
  });

  if (icon === "sun") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="wd-rays">
          <circle cx="32" cy="32" r="11" {...GLYPH_PROPS} {...glyph(0)} />
          {rays.map((ray, index) => (
            <path
              key={index}
              d={`M${ray.x1.toFixed(2)} ${ray.y1.toFixed(2)}L${ray.x2.toFixed(2)} ${ray.y2.toFixed(2)}`}
              {...GLYPH_PROPS}
              {...glyph(index + 1)}
            />
          ))}
        </g>
      </svg>
    );
  }

  if (icon === "moon") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M40 11a21 21 0 1 0 0 42 25 25 0 0 1 0-42Z"
          {...GLYPH_PROPS}
          {...glyph(0)}
        />
        <path
          d="M17 22h4M19 20v4M45 44h3M46.5 42.5v3"
          {...GLYPH_PROPS}
          {...glyph(1)}
        />
      </svg>
    );
  }

  if (icon === "fog") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M9 25c6-4 11 4 17 0s11-4 17 0 9 1 12-1"
          {...GLYPH_PROPS}
          {...glyph(0)}
        />
        <path
          d="M7 34c6-4 11 4 17 0s11-4 17 0 11 3 16-1"
          {...GLYPH_PROPS}
          {...glyph(1)}
        />
        <path
          d="M12 43c6-4 11 4 17 0s11-4 17 0 7 1 10 0"
          {...GLYPH_PROPS}
          {...glyph(2)}
        />
      </svg>
    );
  }

  if (icon === "storm") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M17 38h29a9 9 0 0 0 1-17.9A13 13 0 0 0 21.4 17 9 9 0 0 0 17 38Z"
          {...GLYPH_PROPS}
          {...glyph(0, "wd-cloud")}
        />
        <path
          d="M33 41l-8 12h7l-3 9 12-14h-7l4-7Z"
          {...GLYPH_PROPS}
          {...glyph(1)}
        />
      </svg>
    );
  }

  if (icon === "snow") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M17 36h29a9 9 0 0 0 1-17.9A13 13 0 0 0 21.4 15 9 9 0 0 0 17 36Z"
          {...GLYPH_PROPS}
          {...glyph(0, "wd-cloud")}
        />
        <path
          d="M22 46v7M19 47.5l6 4M25 47.5l-6 4M42 46v7M39 47.5l6 4M45 47.5l-6 4"
          {...GLYPH_PROPS}
          {...glyph(1)}
        />
      </svg>
    );
  }

  if (icon === "rain") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M17 35h29a9 9 0 0 0 1-17.9A13 13 0 0 0 21.4 14 9 9 0 0 0 17 35Z"
          {...GLYPH_PROPS}
          {...glyph(0, "wd-cloud")}
        />
        <path
          d="M24 43l-3 9M33 43l-3 9M42 43l-3 9"
          {...GLYPH_PROPS}
          {...glyph(1)}
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M16 45h31a9.5 9.5 0 0 0 1-18.9A13.5 13.5 0 0 0 21 23 9.5 9.5 0 0 0 16 45Z"
        {...GLYPH_PROPS}
        {...glyph(0, "wd-cloud")}
      />
    </svg>
  );
}

function Odometer({
  parts,
  readingKey,
}: {
  parts: TemperatureParts | null;
  readingKey: string;
}) {
  if (!parts)
    return (
      <span key="dash" className="weather-desk__dash" aria-hidden="true">
        <i />
      </span>
    );
  return (
    <span key={readingKey} className="weather-desk__odo" aria-hidden="true">
      {parts.sign && (
        <span className="weather-desk__odo-sign">{parts.sign}</span>
      )}
      {parts.digits.map((digit, index) => (
        <span className="weather-desk__odo-cell" key={`${index}-${digit}`}>
          <span
            className="weather-desk__odo-track"
            style={
              {
                "--digit": digit,
                "--index": index,
              } as CSSProperties
            }
          >
            {Array.from({ length: 10 }, (_, face) => (
              <span key={face}>{face}</span>
            ))}
          </span>
        </span>
      ))}
      <span className="weather-desk__degree">°C</span>
    </span>
  );
}

export function WeatherDesk({
  variant = "hero",
}: {
  variant?: "hero" | "strip";
}) {
  const rootRef = useRef<HTMLElement>(null);
  const aliveRef = useRef(true);
  const startedRef = useRef(false);
  const bootRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reading, setReading] = useState<WeatherReading | null>(null);
  const [stamp, setStamp] = useState("");
  const [systemReduced, setSystemReduced] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const { paused } = useMotionPreference();

  const motionOff = paused || systemReduced;

  useEffect(() => {
    // React StrictMode mounts, cleans up and mounts again in development.
    // Restore the flag on every mount so the second pass still commits state.
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => {
      setSystemReduced(reduced.matches);
      setFinePointer(fine.matches);
    };
    sync();
    reduced.addEventListener("change", sync);
    fine.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      fine.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    setStamp(
      new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
        .format(new Date())
        .replace(/,/g, "")
        .toUpperCase(),
    );
  }, []);

  const load = useCallback(async (place: SavedPlace) => {
    setPhase("reading");
    const next = await fetchWeather(place.lat, place.lon);
    if (!aliveRef.current) return;
    if (!next) {
      setPhase("unavailable");
      return;
    }
    setReading(next);
    setPhase("ready");
  }, []);

  const ask = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("locating");
    markAskedForPlace(window.localStorage);
    try {
      const result = await requestVisitorPlace();
      if (!aliveRef.current) return;
      if (!result.ok) {
        setPhase(result.reason === "denied" ? "denied" : "unavailable");
        return;
      }
      writeSavedPlace(window.localStorage, result.lat, result.lon);
      await load({
        lat: result.lat,
        lon: result.lon,
        savedAt: Date.now(),
      });
    } finally {
      startedRef.current = false;
    }
  }, [load]);

  const retry = useCallback(() => {
    const saved = readSavedPlace(window.localStorage);
    if (saved) void load(saved);
    else void ask();
  }, [ask, load]);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const saved = readSavedPlace(window.localStorage);
    if (saved) {
      void load(saved);
    } else {
      void (async () => {
        const permission = await geolocationPermission();
        if (!aliveRef.current) return;
        // Never prompt on page load: only reuse a permission the visitor already
        // granted. A first visit shows the invitation instead, even when the
        // browser reports a pre-emptive "denied" for an unrequested permission.
        if (permission === "granted") void ask();
        else if (
          permission === "denied" &&
          hasAskedForPlace(window.localStorage)
        )
          setPhase("denied");
        else setPhase("idle");
      })();
    }
    return () => {
      // The StrictMode re-mount must be able to bootstrap again.
      bootRef.current = false;
    };
  }, [ask, load]);

  useEffect(() => {
    if (phase !== "ready") return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("alps-print-refresh"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, reading]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!finePointer || motionOff) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--wd-x", `${(x * 14).toFixed(2)}px`);
    node.style.setProperty("--wd-y", `${(y * 9).toFixed(2)}px`);
  };

  const resetPointer = () => {
    const node = rootRef.current;
    if (!node) return;
    node.style.removeProperty("--wd-x");
    node.style.removeProperty("--wd-y");
  };

  const temp = reading ? splitTemperature(reading.temperature) : null;
  const copy = phase === "ready" ? null : PHASE_COPY[phase];
  const status = statusFor(phase, reading);
  const placeLabel = reading ? formatPlaceLabel(reading.timezone) : "YOUR SKY";
  const temperatureLabel = reading
    ? `当前气温 ${reading.temperature} 摄氏度，${reading.labelZh}`
    : "气温读取中";
  const readingKey = reading
    ? `${reading.time}:${reading.temperature}:${reading.code}`
    : "pending";

  if (variant === "hero") {
    return (
      <section
        ref={rootRef}
        className="weather-desk weather-desk--hero"
        data-phase={phase}
        data-motion={motionOff ? "off" : "on"}
        data-tone={reading?.tone ?? "none"}
        aria-label="气象台：当地此刻天气"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointer}
      >
        <span className="weather-desk__sweep" aria-hidden="true" />
        <span className="weather-desk__scan" aria-hidden="true" />
        <span className="weather-desk__hero-main">
          <span className="weather-desk__hero-icon" aria-hidden="true">
            <WeatherGlyph icon={reading?.icon ?? "cloud"} />
          </span>
          <span
            className="weather-desk__hero-temp"
            aria-label={temperatureLabel}
          >
            <Odometer parts={temp} readingKey={readingKey} />
          </span>
          <span className="weather-desk__hero-copy">
            <span className="weather-desk__hero-condition">
              {reading?.labelZh ?? copy?.zh}
            </span>
            {reading && (
              <span className="weather-desk__hero-place">{placeLabel}</span>
            )}
          </span>
          {(phase === "ready" ||
            phase === "locating" ||
            phase === "reading") && (
            <span
              className="weather-desk__hero-live"
              role="status"
              aria-live="polite"
            >
              <i
                data-live={status.live ? "true" : "false"}
                aria-hidden="true"
              />
              {status.text}
            </span>
          )}
          {phase === "ready" ? (
            <button
              type="button"
              className="weather-desk__hero-action"
              onClick={() => void ask()}
              aria-label="重新定位并读取天气"
            >
              ↻
            </button>
          ) : phase === "idle" ? (
            <button
              type="button"
              className="weather-desk__hero-action weather-desk__hero-action--invite"
              onClick={() => void ask()}
              title="一次定位，只用于本地天气。坐标留在你的浏览器。"
            >
              看看你那里的天气 <span aria-hidden="true">→</span>
            </button>
          ) : phase === "denied" ? (
            <button
              type="button"
              className="weather-desk__hero-action weather-desk__hero-action--invite"
              onClick={() => void ask()}
              title="可在浏览器地址栏的站点设置里重新开启定位。"
            >
              再试一次 <span aria-hidden="true">→</span>
            </button>
          ) : phase === "unavailable" ? (
            <button
              type="button"
              className="weather-desk__hero-action weather-desk__hero-action--invite"
              onClick={retry}
            >
              重新连接 <span aria-hidden="true">↻</span>
            </button>
          ) : null}
        </span>
        <span className="weather-desk__hero-note">
          {reading
            ? reading.handNote
            : phase === "idle"
              ? "一次定位 · 只用于本地天气 · 坐标留在浏览器"
              : (copy?.hand ?? "")}
        </span>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className="weather-desk"
      data-phase={phase}
      data-motion={motionOff ? "off" : "on"}
      data-tone={reading?.tone ?? "none"}
      aria-labelledby="weather-desk-title"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <span className="weather-desk__sweep" aria-hidden="true" />
      <span className="weather-desk__scan" aria-hidden="true" />
      <span className="weather-desk__fog" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <header className="weather-desk__head">
        <h2 id="weather-desk-title" className="weather-desk__eyebrow">
          <PrintInk>WEATHER DESK / 气象台</PrintInk>
        </h2>
        <p className="weather-desk__stamp" role="status" aria-live="polite">
          <span
            className="weather-desk__dot"
            data-live={status.live ? "true" : "false"}
            aria-hidden="true"
          />
          <span className="weather-desk__stamp-text">
            <PrintInk>{status.text}</PrintInk>
          </span>
          <span className="weather-desk__date">
            <PrintInk>{stamp}</PrintInk>
          </span>
        </p>
      </header>

      <div className="weather-desk__main">
        <div className="weather-desk__figure">
          <span className="weather-desk__icon">
            <PrintInk aria-hidden="true">
              <WeatherGlyph icon={reading?.icon ?? "cloud"} />
            </PrintInk>
            <span className="weather-desk__reg" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path d="M10 1v18M1 10h18" />
                <circle cx="10" cy="10" r="5.4" />
              </svg>
            </span>
          </span>
          <p className="weather-desk__temp" aria-label={temperatureLabel}>
            <PrintInk className="weather-desk__temp-ink">
              <Odometer parts={temp} readingKey={readingKey} />
            </PrintInk>
          </p>
        </div>

        <div className="weather-desk__copy">
          <p className="weather-desk__condition">
            <PrintInk className="weather-desk__condition-zh">
              {reading?.labelZh ?? copy?.zh}
            </PrintInk>
          </p>
          <p className="weather-desk__condition-en">
            <PrintInk>{reading?.labelEn ?? copy?.en}</PrintInk>
          </p>
          <p className="weather-desk__hand">
            <PrintInk>{reading?.handNote ?? copy?.hand}</PrintInk>
          </p>
        </div>

        <div className="weather-desk__meta">
          <p className="weather-desk__place">
            <PrintInk>{placeLabel}</PrintInk>
          </p>
          <p className="weather-desk__updated">
            <PrintInk>
              {reading
                ? `UPDATED ${clockLabel(reading.time) || "NOW"}`
                : "NOT YET READ"}
            </PrintInk>
          </p>

          {phase === "idle" && (
            <div className="weather-desk__actions">
              <button
                type="button"
                className="weather-desk__action"
                onClick={() => void ask()}
              >
                看看你那里的天气 <span aria-hidden="true">→</span>
              </button>
              <span className="weather-desk__note">
                一次定位，只用于本地天气。坐标留在你的浏览器。
              </span>
            </div>
          )}

          {phase === "denied" && (
            <div className="weather-desk__actions">
              <button
                type="button"
                className="weather-desk__action"
                onClick={() => void ask()}
              >
                再试一次 <span aria-hidden="true">↻</span>
              </button>
              <span className="weather-desk__note">
                可在浏览器地址栏的站点设置里重新开启定位。
              </span>
            </div>
          )}

          {phase === "unavailable" && (
            <div className="weather-desk__actions">
              <button
                type="button"
                className="weather-desk__action"
                onClick={() => {
                  const saved = readSavedPlace(window.localStorage);
                  if (saved) void load(saved);
                  else void ask();
                }}
              >
                重新连接 <span aria-hidden="true">↻</span>
              </button>
              <span className="weather-desk__note">
                天气服务暂时没有回应，稍后再试也可以。
              </span>
            </div>
          )}

          {phase === "ready" && (
            <button
              type="button"
              className="weather-desk__again"
              onClick={() => void ask()}
              aria-label="重新定位并读取天气"
            >
              重新定位 ↻
            </button>
          )}
        </div>
      </div>

      <footer className="weather-desk__foot">
        <span className="weather-desk__foot-rule" aria-hidden="true" />
        <a
          className="weather-desk__credit"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <PrintInk>WEATHER BY OPEN-METEO</PrintInk>
        </a>
      </footer>

      <WeatherParticles
        tone={reading?.tone ?? null}
        isDay={reading?.isDay ?? true}
        paused={motionOff}
        enabled={phase === "ready"}
      />
    </section>
  );
}
