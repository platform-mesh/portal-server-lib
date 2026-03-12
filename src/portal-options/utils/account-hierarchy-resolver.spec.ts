import {
  processContentConfigurationForAccountHierarchy,
  updateAccountNodeChildren,
  updateEntityTypeFromAccountPath,
} from './account-hierarchy-resolver.js';
import { ContentConfiguration } from '@openmfp/portal-server-lib';

const createMockContentConfiguration = (
  overrides: Partial<ContentConfiguration> = {},
): ContentConfiguration => ({
  name: 'test-config',
  creationTimestamp: '2024-01-01T00:00:00Z',
  luigiConfigFragment: {
    data: {
      nodes: [],
    },
  },
  ...overrides,
});

describe('updateEntityTypeFromAccountPath', () => {
  it('should update single entity type for single-level account path', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'core_platform-mesh_io_account' }],
        },
      },
    });

    const result = updateEntityTypeFromAccountPath(config, 'acc1');

    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account',
    );
  });

  it('should update entity type for multi-level account path', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'core_platform-mesh_io_account' }],
        },
      },
    });

    const result = updateEntityTypeFromAccountPath(config, 'acc1:acc2:acc3');

    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account.core_platform-mesh_io_account.core_platform-mesh_io_account',
    );
  });

  it('should update entity types for multiple nodes', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            { entityType: 'core_platform-mesh_io_account' },
            { entityType: 'core_platform-mesh_io_account' },
          ],
        },
      },
    });

    const result = updateEntityTypeFromAccountPath(config, 'acc1:acc2');

    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account.core_platform-mesh_io_account',
    );
    expect(result.luigiConfigFragment.data.nodes[1].entityType).toBe(
      'core_platform-mesh_io_account.core_platform-mesh_io_account',
    );
  });

  it('should not modify entity types that do not match account entity type', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'other_entity_type' }],
        },
      },
    });

    const result = updateEntityTypeFromAccountPath(config, 'acc1');

    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'other_entity_type',
    );
  });

  it('should return the same configuration object', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'core_platform-mesh_io_account' }],
        },
      },
    });

    const result = updateEntityTypeFromAccountPath(config, 'acc1');

    expect(result).toBe(config);
  });
});

describe('updateAccountNodeChildren', () => {
  it('should update children node for single-level account path', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {},
                  pathSegment: 'old-path',
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.defineEntity.id).toBe('old-id');
    expect(childNode.pathSegment).toBe(':2_core_platform-mesh_io_accountId');
  });

  it('should replace all additional fields equal to previous pathSegment', () => {
    const oldPathSegment = ':core_platform-mesh_io_accountId';
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: {
                    id: 'old-id',
                    contextKey: oldPathSegment,
                    additionalContextKeys: [oldPathSegment],
                  } as any,
                  context: {
                    accountId: oldPathSegment,
                    customPath: oldPathSegment,
                    nested: [{ deepPath: oldPathSegment }],
                  },
                  pathSegment: oldPathSegment,
                  navHeader: {
                    label: oldPathSegment,
                  },
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.pathSegment).toBe(':2_core_platform-mesh_io_accountId');
    expect(childNode.defineEntity.contextKey).toBe(
      ':2_core_platform-mesh_io_accountId',
    );
    expect(childNode.defineEntity.additionalContextKeys[0]).toBe(
      ':2_core_platform-mesh_io_accountId',
    );
    expect(childNode.context.customPath).toBe(':2_core_platform-mesh_io_accountId');
    expect(childNode.context.nested[0].deepPath).toBe(
      ':2_core_platform-mesh_io_accountId',
    );
    expect(childNode.navHeader.label).toBe(':2_core_platform-mesh_io_accountId');
  });

  it('should keep defineEntity.id controlled only by explicit assignment', () => {
    const oldPathSegment = ':core_platform-mesh_io_accountId';
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: {
                    id: oldPathSegment,
                  },
                  context: {},
                  pathSegment: oldPathSegment,
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.defineEntity.id).toBe(':2_core_platform-mesh_io_accountId');
  });

  it('should not replace strings that only partially match previous pathSegment', () => {
    const oldPathSegment = ':core_platform-mesh_io_accountId';
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {
                    exact: oldPathSegment,
                    partial: `${oldPathSegment}:suffix`,
                  },
                  pathSegment: oldPathSegment,
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.context.exact).toBe(':2_core_platform-mesh_io_accountId');
    expect(childNode.context.partial).toBe(':core_platform-mesh_io_accountId:suffix');
  });

  it('should not set pathSegment when previous pathSegment is missing', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {},
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.pathSegment).toBeUndefined();
    expect(childNode.defineEntity.id).toBe('old-id');
  });

  it('should update children node for multi-level account path', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {},
                  pathSegment: 'old-path',
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1:acc2:acc3');
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.defineEntity.id).toBe('old-id');
    expect(childNode.pathSegment).toBe(':4_core_platform-mesh_io_accountId');
  });

  it('should not fail when there are no nodes', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');

    expect(result).toBe(config);
  });

  it('should not fail when first node has no children', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'test' }],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');

    expect(result).toBe(config);
  });

  it('should not fail when children array is empty', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [{ children: [] }],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');

    expect(result).toBe(config);
  });

  it('should return the same configuration object', () => {
    const config = createMockContentConfiguration({
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {},
                  pathSegment: 'old-path',
                },
              ],
            },
          ],
        },
      },
    });

    const result = updateAccountNodeChildren(config, 'acc1');

    expect(result).toBe(config);
  });
});

describe('processContentConfigurationForAccountHierarchy', () => {
  it('should call updateAccountNodeChildren for accounts configuration', () => {
    const config = createMockContentConfiguration({
      name: 'accounts',
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              entityType: 'core_platform-mesh_io_account',
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {},
                  pathSegment: 'old-path',
                },
              ],
            },
          ],
        },
      },
    });

    const result = processContentConfigurationForAccountHierarchy(config, {
      accountPath: 'acc1',
    });
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.defineEntity.id).toBe('old-id');
    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account',
    );
  });

  it('should not call updateAccountNodeChildren for non-accounts configuration', () => {
    const config = createMockContentConfiguration({
      name: 'other-config',
      luigiConfigFragment: {
        data: {
          nodes: [
            {
              entityType: 'core_platform-mesh_io_account',
              children: [
                {
                  defineEntity: { id: 'old-id' },
                  context: {},
                  pathSegment: 'old-path',
                },
              ],
            },
          ],
        },
      },
    });

    const result = processContentConfigurationForAccountHierarchy(config, {
      accountPath: 'acc1',
    });
    const childNode = result.luigiConfigFragment.data.nodes[0]
      .children?.[0] as any;

    expect(childNode.defineEntity.id).toBe('old-id');
    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account',
    );
  });

  it('should always call updateEntityTypeFromAccountPath', () => {
    const config = createMockContentConfiguration({
      name: 'any-config',
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'core_platform-mesh_io_account' }],
        },
      },
    });

    const result = processContentConfigurationForAccountHierarchy(config, {
      accountPath: 'acc1:acc2',
    });

    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account.core_platform-mesh_io_account',
    );
  });

  it('should return the same configuration object', () => {
    const config = createMockContentConfiguration({
      name: 'test-config',
      luigiConfigFragment: {
        data: {
          nodes: [{ entityType: 'core_platform-mesh_io_account' }],
        },
      },
    });

    const result = processContentConfigurationForAccountHierarchy(config, {
      accountPath: 'acc1',
    });

    expect(result).toBe(config);
  });
});
