// Server components nest here — the feed renders the ring row, the staff strip and the propose band, each an
// `async` function — and jsdom's React renders no async component. This walks a tree and awaits every async
// function component in it, leaving every other element (client components, hooks and all) for React.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type AnyProps = { children?: ReactNode } & Record<string, unknown>;

export async function resolveTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map((n) => resolveTree(n)));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<AnyProps>;
  const type = element.type as unknown;
  if (typeof type === "function" && (type as { constructor: { name: string } }).constructor.name === "AsyncFunction") {
    return resolveTree(await (type as (p: AnyProps) => Promise<ReactNode>)(element.props));
  }
  const props: AnyProps = { ...element.props };
  for (const [key, value] of Object.entries(props)) {
    if (isValidElement(value)) props[key] = await resolveTree(value);
  }
  if (element.props.children !== undefined) {
    const kids = await Promise.all(Children.toArray(element.props.children).map((c) => resolveTree(c)));
    return cloneElement(element, props, ...kids);
  }
  return cloneElement(element, props);
}
