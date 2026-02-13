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
      'core_platform-mesh_io_account:1',
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
      'core_platform-mesh_io_account:1.core_platform-mesh_io_account:2.core_platform-mesh_io_account:3',
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
      'core_platform-mesh_io_account:1.core_platform-mesh_io_account:2',
    );
    expect(result.luigiConfigFragment.data.nodes[1].entityType).toBe(
      'core_platform-mesh_io_account:1.core_platform-mesh_io_account:2',
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

    expect(childNode.defineEntity.id).toBe('core_platform-mesh_io_account:2');
    expect(childNode.context.accountId).toBe(
      ':core_platform-mesh_io_accountId:2',
    );
    expect(childNode.context['core_platform-mesh_io_accountId']).toBe(
      ':core_platform-mesh_io_accountId:2',
    );
    expect(childNode.context.resourceId).toBe(
      ':core_platform-mesh_io_accountId:2',
    );
    expect(childNode.pathSegment).toBe(':core_platform-mesh_io_accountId:2');
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

    expect(childNode.defineEntity.id).toBe('core_platform-mesh_io_account:4');
    expect(childNode.context.accountId).toBe(
      ':core_platform-mesh_io_accountId:4',
    );
    expect(childNode.pathSegment).toBe(':core_platform-mesh_io_accountId:4');
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

    expect(childNode.defineEntity.id).toBe('core_platform-mesh_io_account:2');
    expect(result.luigiConfigFragment.data.nodes[0].entityType).toBe(
      'core_platform-mesh_io_account:1',
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
      'core_platform-mesh_io_account:1',
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
      'core_platform-mesh_io_account:1.core_platform-mesh_io_account:2',
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
