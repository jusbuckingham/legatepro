

import * as React from "react";

import { cn } from "@/lib/utils";

export type TableDensity = "compact" | "default";

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  density?: TableDensity;
};

/**
 * Lightweight table primitives.
 *
 * Use <TableWrap> for horizontal scrolling on small screens.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = "default", ...props }, ref) => {
    const densityClasses =
      density === "compact"
        ? "text-[11px] leading-5"
        : "text-xs leading-6";

    return (
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom border-separate border-spacing-0",
          densityClasses,
          className
        )}
        {...props}
      />
    );
  }
);
Table.displayName = "Table";

/**
 * Wrapper that provides rounded border + horizontal scroll when needed.
 */
const TableWrap = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80",
      className
    )}
    {...props}
  />
));
TableWrap.displayName = "TableWrap";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-slate-900/60 text-slate-300", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("divide-y divide-slate-800 text-slate-100", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-slate-800 bg-slate-900/50 text-slate-200",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors hover:bg-slate-900/60 data-[state=selected]:bg-slate-900/70",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
};

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, align = "left", ...props }, ref) => {
    const alignClass =
      align === "right"
        ? "text-right"
        : align === "center"
        ? "text-center"
        : "text-left";

    return (
      <th
        ref={ref}
        className={cn(
          "h-9 whitespace-nowrap border-b border-slate-800 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
          alignClass,
          className
        )}
        {...props}
      />
    );
  }
);
TableHead.displayName = "TableHead";

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
};

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, align = "left", ...props }, ref) => {
    const alignClass =
      align === "right"
        ? "text-right"
        : align === "center"
        ? "text-center"
        : "text-left";

    return (
      <td
        ref={ref}
        className={cn(
          "whitespace-nowrap px-4 py-2 text-slate-200",
          alignClass,
          className
        )}
        {...props}
      />
    );
  }
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-left text-xs text-slate-500", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableWrap,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};