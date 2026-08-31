import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { PermissionsDefinition } from '../services/permissions/models/permissions.model.js';

export interface ResourceDefinitionLocal {
  entity: string;
  permissionsDefinition?: PermissionsDefinition;
}

function mergeResourceActions(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] {
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

    if (rd?.entity !== undefined && rd.permissionsDefinition !== undefined) {
      const existing = acc.get(rd.entity);

      // Keep the latest permissionsDefinition, but union its resourceActions
      // with the previously collected one's (dedupe across duplicate entities).
      acc.set(rd.entity, {
        ...rd,
        permissionsDefinition: {
          ...rd.permissionsDefinition,
          resourceActions: mergeResourceActions(
            existing?.permissionsDefinition?.resourceActions,
            rd.permissionsDefinition.resourceActions,
          ),
        },
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
