import Link from "@/components/motion-link";
import { type Entry } from "@/lib/content";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
export function ProjectCard({
  entry,
  index = 0,
}: {
  entry: Entry;
  index?: number;
}) {
  return (
    <Link
      href={`/work/${entry.slug}`}
      className={`project-card theme-${entry.theme}`}
    >
      {entry.coverPath ? (
        <div className="project-cover-frame">
          <EntryCover
            entry={entry}
            className="project-cover"
            sizes="(max-width: 700px) 90vw, (max-width: 1000px) 30vw, 400px"
          />
          <span className="project-image-number">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
      ) : (
        <div className="project-art">
          <div className="art-top">
            <span>{String(index + 1).padStart(2, "0")} / SELECTED PROJECT</span>
            <span>{entry.year}</span>
          </div>
          <div className="art-center">
            <span className={entry.theme === "ink" ? "art-hand" : "art-title"}>
              {entry.title}
            </span>
            <span className="art-subtitle">{entry.subtitle}</span>
          </div>
          <div className="art-bottom">
            <span>{entry.tags.split(",").slice(0, 2).join(" / ")}</span>
            <span className="art-sign">
              <BrandIcon name="ridge" width={50} height={25} />
            </span>
          </div>
        </div>
      )}
      <div className="project-info">
        <div>
          <h3>{entry.title}</h3>
          <p>{entry.category}</p>
        </div>
        <span className="project-year">{entry.year}</span>
      </div>
    </Link>
  );
}
