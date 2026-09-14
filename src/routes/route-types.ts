export type RouteNodeType = 'component' | 'lazy-component' | 'children' | 'lazy-routes' | 'redirect' | 'wildcard' | 'unknown';
export interface RouteReference { name: string; file?: string; source?: string; expression?: string }
export interface RouteMapNode {
  migration?: {
    structural: string;
    layout: string;
    remaining: number | null;
    actions: string[];
    files: string[];
  };
  id: string;
  parentId?: string;
  path: string | null;
  fullPath: string | null;
  type: RouteNodeType;
  wildcard: boolean;
  pathMatch?: unknown;
  redirectTo?: unknown;
  outlet?: unknown;
  matcher?: unknown;
  resolve?: unknown;
  providers?: unknown;
  title?: unknown;
  description?: unknown;
  data?: unknown;
  metadata?: Record<string, unknown>;
  componentName?: string;
  componentFile?: string;
  lazy: boolean;
  loadComponent?: RouteReference;
  loadChildren?: RouteReference;
  guards: Record<string, RouteReference[]>;
  routeFile: string;
  sourceLocation: { file: string; line: number; column: number };
  status: 'resolved' | 'partial';
  children: RouteMapNode[];
}
export interface RouteMapReport {
  totalRoutes: number;
  resolvedComponents: number;
  lazyRoutes: number;
  redirectRoutes: number;
  warnings: string[];
  tree: RouteMapNode[];
  componentRoutes: { componentName: string; componentFile: string; routeIds: string[]; fullPaths: (string | null)[] }[];
}
export function flattenRoutes(tree: RouteMapNode[]): RouteMapNode[] {
  const result: RouteMapNode[] = [];
  const stack = [...tree].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    result.push(node);
    stack.push(...[...node.children].reverse());
  }
  return result;
}
