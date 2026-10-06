import Image from "next/image";
import type { Entry } from "@/lib/content";
import { MotionMedia } from "@/components/motion-media";

export function EntryCover({
  entry,
  className = "",
  sizes = "(max-width: 700px) 100vw, 80vw",
  preload = false,
  parallax = false,
}: {
  entry: Pick<Entry, "title" | "coverPath" | "coverAlt">;
  className?: string;
  sizes?: string;
  preload?: boolean;
  parallax?: boolean;
}) {
  if (!entry.coverPath) return null;
  return (
    <MotionMedia
      enabled={parallax}
      className={`content-cover ${className}`.trim()}
    >
      <Image
        src={entry.coverPath}
        alt={entry.coverAlt || `${entry.title}的封面`}
        fill
        sizes={sizes}
        preload={preload}
      />
    </MotionMedia>
  );
}
