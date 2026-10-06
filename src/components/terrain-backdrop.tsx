import styles from "./terrain-backdrop.module.css";

type TerrainVariant = "contours" | "intro" | "ridge" | "night";

/** Static, section-local artwork. Its parent supplies an isolated stacking context. */
export function TerrainBackdrop({
  variant = "contours",
  side = "right",
}: {
  variant?: TerrainVariant;
  side?: "left" | "right";
}) {
  return (
    <div
      className={`${styles.backdrop} ${styles[variant]} ${side === "left" ? styles.left : ""}`}
      aria-hidden="true"
    >
      <span className={styles.grain} />
      <span className={styles.contour} />
      {variant === "ridge" && (
        <svg className={styles.relief} viewBox="0 0 900 420" fill="none">
          <circle cx="645" cy="150" r="95" fill="#d7c8a7" />
          <path
            d="m90 420 194-205 63 64L464 92l117 162 61-64 230 230H90Z"
            fill="#d8dbcd"
          />
          <path
            d="m245 420 130-155 54 53 97-165 96 159 73-99 205 207H245Z"
            fill="#c9d0bd"
          />
          <path
            d="m420 420 128-115 50 45 117-161 68 99 43-35 74 80v87H420Z"
            fill="#b9c3aa"
          />
          <path
            d="m383 218 81-126 70 97-57-32-15 15-13-31-66 77Zm303 13 29-42 35 51-28-16-9 8-6-12-21 11Z"
            fill="#f5f3eb"
            opacity=".72"
          />
          <path
            d="M110 378c151-52 206 32 361-10s258 28 401-10M173 400c134-35 249 24 354-5s192-5 291-6"
            stroke="#879478"
            strokeWidth=".8"
            opacity=".4"
          />
        </svg>
      )}
    </div>
  );
}
