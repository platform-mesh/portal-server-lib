import { replaceStringDeep } from './replace-string-deep.js';
import { ContentConfiguration } from '@openmfp/portal-server-lib';

const ACCOUNT_ENTITY_TYPE = 'core_platform-mesh_io_account';

export const updateEntityTypeFromAccountPath = (
  contentConfiguration: ContentConfiguration,
  accountPath: string,
): ContentConfiguration => {
  contentConfiguration.luigiConfigFragment.data.nodes.forEach((node) => {
    if (!node.entityType.includes(ACCOUNT_ENTITY_TYPE)) {
      return;
    }

    const accountPathParts = accountPath
      .split(':')
      .filter(Boolean)
      .map(() => ACCOUNT_ENTITY_TYPE)
      .join('.');

    node.entityType = node.entityType.replace(
      ACCOUNT_ENTITY_TYPE,
      accountPathParts,
    );
  });

  return contentConfiguration;
};

export const updateAccountNodeChildren = (
  contentConfiguration: ContentConfiguration,
  accountPath: string,
): ContentConfiguration => {
  const accountChildrenNode =
    contentConfiguration.luigiConfigFragment.data.nodes[0]?.children?.[0];

  if (accountChildrenNode) {
    const nextHierarchyLevel =
      accountPath.split(':').filter(Boolean).length + 1;
    const previousPathSegment = accountChildrenNode.pathSegment;
    const nextPathSegment = `:${ACCOUNT_ENTITY_TYPE}Id:${nextHierarchyLevel}`;

    replaceStringDeep(
      accountChildrenNode,
      previousPathSegment,
      nextPathSegment,
    );
  }

  return contentConfiguration;
};

export const processContentConfigurationForAccountHierarchy = (
  contentConfiguration: ContentConfiguration,
  context: Record<string, any>,
): ContentConfiguration => {
  const accountPath = context.accountPath || context[ACCOUNT_ENTITY_TYPE];
  if (accountPath) {
    if (contentConfiguration.name === 'accounts') {
      updateAccountNodeChildren(contentConfiguration, accountPath);
    }

    return updateEntityTypeFromAccountPath(contentConfiguration, accountPath);
  }
};
