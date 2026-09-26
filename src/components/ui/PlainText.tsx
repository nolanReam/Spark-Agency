import type { HTMLAttributes } from "react";

/** Renders trusted-as-text content while preserving instructor-entered formatting. */
export function PlainText({ style, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      {...props}
      style={{
        ...style,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
      }}
    />
  );
}
