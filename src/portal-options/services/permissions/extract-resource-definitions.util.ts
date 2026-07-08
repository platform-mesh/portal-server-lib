import { AuthorizationRequest } from './permissions.model.js';
import { ContentConfiguration } from '@openmfp/portal-server-lib';

interface ResourceDefinitionLocal {
  entity: string;
  entityCollection?: string;
  checkActions?: string[] | 'All';
}

type CheckEntry = AuthorizationRequest['checks'][number];

function collectFromNodes(
  nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'],
  acc: Map<string, CheckEntry>,
): void {
  for (const node of nodes) {
    const rd = node.context?.['resourceDefinition'] as
      | ResourceDefinitionLocal
      | undefined;

    if (rd?.entity !== undefined && rd.checkActions !== undefined) {
      const resource = rd.entity;
      const existing = acc.get(resource);

      if (rd.checkActions === 'All' || existing?.actions === 'All') {
        acc.set(resource, { resource, actions: 'All' });
      } else {
        const merged = existing
          ? [...(existing.actions as string[]), ...rd.checkActions]
          : [...rd.checkActions];
        acc.set(resource, {
          resource,
          actions: [...new Set(merged)],
        });
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
): AuthorizationRequest['checks'] {
  const acc = new Map<string, CheckEntry>();

  for (const cc of contentConfigurations) {
    const nodes = cc.luigiConfigFragment?.data?.nodes;
    if (Array.isArray(nodes)) {
      collectFromNodes(nodes, acc);
    }
  }

  return Array.from(acc.values());
}
