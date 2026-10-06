import type { SVGProps } from "react";

const viewBoxes = {
  mark: "0 0 64 64",
  wordmark: "0 0 160 64",
  ridge: "0 0 128 64",
  stamp: "0 0 100 100",
  compass: "0 0 24 24",
  work: "0 0 24 24",
  writing: "0 0 24 24",
  profile: "0 0 24 24",
  mail: "0 0 24 24",
  arrow: "0 0 24 24",
  menu: "0 0 24 24",
  close: "0 0 24 24",
  exit: "0 0 24 24",
  draft: "0 0 24 24",
} as const;

export type BrandSymbol = keyof typeof viewBoxes;

type BrandIconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: BrandSymbol;
  size?: number;
  label?: string;
};

export function BrandIcon({
  name,
  size = 24,
  className = "",
  label,
  ...props
}: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBoxes[name]}
      fill="none"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      className={`brand-icon ${className}`.trim()}
      {...props}
    >
      <use href={`/brand/alps-sprite.svg#alps-${name}`} />
    </svg>
  );
}

export function BrandLogo({
  name = "Alps",
  className = "",
}: {
  name?: string;
  className?: string;
}) {
  return (
    <span className={`brand-logo ${className}`.trim()} aria-hidden="true">
      <BrandIcon name="mark" size={40} className="brand-logo-mark" />
      {name.trim().toLowerCase() === "alps" ? (
        <BrandIcon
          name="wordmark"
          width={100}
          height={40}
          className="brand-logo-word"
        />
      ) : (
        <span className="brand-logo-name">{name}</span>
      )}
    </span>
  );
}
