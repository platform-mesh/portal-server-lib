/**
 * Builds a KCP workspace/cluster path rooted at `root:orgs`.
 *
 * Truthy segments are appended in order, each prefixed with `:`. Empty,
 * `undefined` or `null` segments are skipped. A segment may itself be a
 * composite path (e.g. `sub:a`) — it is appended verbatim as a single segment,
 * so `['org', 'account']` yields `root:orgs:org:account` while `['sub:a']`
 * yields `root:orgs:sub:a`.
 *
 * This is the minimal common abstraction shared by the two call sites:
 *  - kcp-k8s: `buildWorkspacePath([organization, account])`
 *  - authz-webhook: `buildWorkspacePath([organization, accountPath])`
 */
export function buildWorkspacePath(
  segments: (string | undefined | null)[] = [],
): string {
  return segments.reduce<string>(
    (path, segment) => (segment ? `${path}:${segment}` : path),
    'root:orgs',
  );
}
