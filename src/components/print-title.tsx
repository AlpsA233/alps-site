import type { ComponentPropsWithoutRef } from "react";

type PrintTitleProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  children: string;
};

export function PrintTitle({ children, ...props }: PrintTitleProps) {
  return (
    <span {...props} data-print-title>
      {children}
      <span className="print-title__inverse" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}
