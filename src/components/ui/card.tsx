// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { CardActionsProps, CardBodyProps, CardMediaProps, CardProps } from "@/components/ui";

export function Card({ children, className = "" }: CardProps) {
  return <article className={className}>{children}</article>;
}

export function CardMedia({ src, alt = "", placeholderFrom, className = "" }: CardMediaProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} className={className} /> : <div className={className} aria-hidden>{placeholderFrom.slice(0, 2)}</div>;
}

export function CardBody({ children, className = "" }: CardBodyProps) {
  return <div className={className}>{children}</div>;
}

export function CardActions({ children, className = "" }: CardActionsProps) {
  return <div className={className}>{children}</div>;
}
