import type { ComponentPropsWithoutRef, ReactNode } from "react";

type PrintInkProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  children: ReactNode;
};

export function PrintInk({ children, ...props }: PrintInkProps) {
  return (
    <span {...props} data-print-ink>
      {children}
      <span className="print-title__inverse" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

export function PrintTitle(props: PrintInkProps & { children: string }) {
  return <PrintInk {...props} data-print-title />;
}
