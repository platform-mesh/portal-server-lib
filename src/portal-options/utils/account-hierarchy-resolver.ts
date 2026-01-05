import { ContentConfiguration } from '@openmfp/portal-server-lib';




const ACCOUNT_ENTITY_TYPE = 'core_platform-mesh_io_account';

export const updateEntityTypeFromAccountPath = (
  contentConfiguration: ContentConfiguration,
  accountPath: string,
): ContentConfiguration => {
  contentConfiguration.luigiConfigFragment.data.nodes.forEach((node) => {
    const accountPathParts = accountPath
      .split(':')
      .map((_, i) => `${ACCOUNT_ENTITY_TYPE}:${i + 1}`)
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
  const nextHierarchyLevel = accountPath.split(':').length + 1;

  if (accountChildrenNode) {
    accountChildrenNode.defineEntity.id = `${ACCOUNT_ENTITY_TYPE}:${nextHierarchyLevel}`;
    accountChildrenNode.context.accountId = `:${ACCOUNT_ENTITY_TYPE}Id:${nextHierarchyLevel}`;
    accountChildrenNode.context[`${ACCOUNT_ENTITY_TYPE}Id`] =
      `:${ACCOUNT_ENTITY_TYPE}Id:${nextHierarchyLevel}`;
    accountChildrenNode.context.resourceId = `:${ACCOUNT_ENTITY_TYPE}Id:${nextHierarchyLevel}`;
    accountChildrenNode.pathSegment = `:${ACCOUNT_ENTITY_TYPE}Id:${nextHierarchyLevel}`;
  }

  return contentConfiguration;
};

export const processContentConfigurationForAccountHierarchy = (
  contentConfiguration: ContentConfiguration,
  accountPath: string,
): ContentConfiguration => {
  if (contentConfiguration.name === 'accounts') {
    updateAccountNodeChildren(contentConfiguration, accountPath);
  }

  return updateEntityTypeFromAccountPath(contentConfiguration, accountPath);
};
