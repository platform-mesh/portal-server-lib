import { ContentConfiguration } from '@openmfp/portal-server-lib';

export interface ResourceDefinitionLocal {
  entity: string;
  apiGroup?: string;
  entityCollection?: string;
  scope?: string;
  checkActions?: string[] | 'All';
}

function collectFromNodes(
  nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'],
  acc: Map<string, ResourceDefinitionLocal>,
): void {
  for (const node of nodes) {
    const rd = node.context?.['resourceDefinition'] as ResourceDefinitionLocal | undefined;

    if (rd?.entity !== undefined && rd.checkActions !== undefined) {
      const existing = acc.get(rd.entity);

      if (rd.checkActions === 'All' || existing?.checkActions === 'All') {
        acc.set(rd.entity, { ...rd, checkActions: 'All' });
      } else {
        const merged = existing
          ? [...(existing.checkActions as string[]), ...rd.checkActions]
          : [...rd.checkActions];
        acc.set(rd.entity, { ...rd, checkActions: [...new Set(merged)] });
      }
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
