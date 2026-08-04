import { ContentConfiguration } from '@openmfp/portal-server-lib';

export interface ResourceDefinitionLocal {
  entity: string;
  apiGroup?: string;
  entityCollection?: string;
  scope?: string;
  namespace?: string | null;
  version?: string;
  checkActionsForResource?: string[];
}

function mergeActions(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (existing === undefined && incoming === undefined) {
    return undefined;
  }

  return [...new Set([...(existing ?? []), ...(incoming ?? [])])];
}

function collectFromNodes(
  nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'],
  acc: Map<string, ResourceDefinitionLocal>,
): void {
  for (const node of nodes) {
    const rd = node.context?.['resourceDefinition'] as
      | ResourceDefinitionLocal
      | undefined;

    if (
      rd?.entity !== undefined &&
      rd.checkActionsForResource !== undefined) {
      const existing = acc.get(rd.entity);

      acc.set(rd.entity, {
        ...rd,
        checkActionsForResource: mergeActions(
          existing?.checkActionsForResource,
          rd.checkActionsForResource,
        ),
      });
    }

    const children = node.children;
    if (Array.isArray(children) && children.length > 0) {
      collectFromNodes(children, acc);
    }
  }
}

export function extractResourceDefinitions(
  contentConfigurations: ContentConfiguration[],
): ResourceDefinitionLocal[] {
  const acc = new Map<string, ResourceDefinitionLocal>();

  for (const cc of contentConfigurations) {
    const nodes = cc.luigiConfigFragment?.data?.nodes;
    if (Array.isArray(nodes)) {
      collectFromNodes(nodes, acc);
    }
  }

  return Array.from(acc.values());
}
