import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { PermissionsDefinition } from '../services/permissions/models/permissions.model.js';
import { extractResourceDefinitions } from './extract-resource-definitions.util.js';

function makeCC(
  nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'] = [],
): ContentConfiguration {
  return {
    name: 'test',
    creationTimestamp: '',
    luigiConfigFragment: { data: { nodes } },
  };
}

function makePd(
  overrides: Partial<PermissionsDefinition> = {},
): PermissionsDefinition {
  return {
    group: 'core.platform-mesh.io',
    resource: 'Accounts',
    entityActions: ['get', 'update', 'delete'],
    resourceActions: ['create', 'list'],
    entityContextKey: 'entityName',
    ...overrides,
  };
}

describe('extractResourceDefinitions', () => {
  it('returns empty array for empty content configurations', () => {
    expect(extractResourceDefinitions([])).toEqual([]);
  });

  it('returns empty array when no nodes have resourceDefinition', () => {
    const result = extractResourceDefinitions([makeCC([{ context: {} }])]);
    expect(result).toEqual([]);
  });

  it('ignores resourceDefinition without entity', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              permissionsDefinition: makePd(),
            },
          },
        },
      ]),
    ]);
    expect(result).toEqual([]);
  });

  it('ignores resourceDefinition with entity but without permissionsDefinition', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
            },
          },
        },
      ]),
    ]);
    expect(result).toEqual([]);
  });

  it('collects resourceDefinition that has entity and permissionsDefinition', () => {
    const pd = makePd();
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              permissionsDefinition: pd,
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entity: 'Account',
      permissionsDefinition: pd,
    });
  });

  it('merges duplicate entities across nodes, set-deduping resourceActions', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              permissionsDefinition: makePd({
                resourceActions: ['create', 'list'],
              }),
            },
          },
        },
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              permissionsDefinition: makePd({
                resourceActions: ['list', 'watch'],
              }),
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe('Account');
    // 'list' appears in both → deduplicated
    expect(result[0].permissionsDefinition?.resourceActions).toEqual([
      'create',
      'list',
      'watch',
    ]);
  });

  it('merges duplicate entities across content configurations, set-deduping resourceActions', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Pod',
              permissionsDefinition: makePd({
                resource: 'Pods',
                resourceActions: ['list', 'create'],
              }),
            },
          },
        },
      ]),
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Pod',
              permissionsDefinition: makePd({
                resource: 'Pods',
                resourceActions: ['create', 'watch'],
              }),
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].permissionsDefinition?.resourceActions).toEqual([
      'list',
      'create',
      'watch',
    ]);
  });

  it('keeps the latest permissionsDefinition fields when merging duplicates', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              permissionsDefinition: makePd({ group: 'old.group' }),
            },
          },
        },
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              permissionsDefinition: makePd({ group: 'new.group' }),
            },
          },
        },
      ]),
    ]);

    expect(result[0].permissionsDefinition?.group).toBe('new.group');
  });

  it('collects resource definitions from nested children nodes', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {},
          children: [
            {
              context: {
                resourceDefinition: {
                  entity: 'NestedEntity',
                  permissionsDefinition: makePd(),
                },
              },
            },
          ],
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe('NestedEntity');
  });

  it('handles deeply nested children nodes', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {},
          children: [
            {
              context: {},
              children: [
                {
                  context: {
                    resourceDefinition: {
                      entity: 'DeepEntity',
                      permissionsDefinition: makePd(),
                    },
                  },
                },
              ],
            },
          ],
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe('DeepEntity');
  });

  it('collects definitions from multiple content configurations', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Alpha',
              permissionsDefinition: makePd({ resource: 'Alphas' }),
            },
          },
        },
      ]),
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Beta',
              permissionsDefinition: makePd({ resource: 'Betas' }),
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(2);
    const entities = result.map((r) => r.entity);
    expect(entities).toContain('Alpha');
    expect(entities).toContain('Beta');
  });

  it('handles content configurations with null or missing nodes gracefully', () => {
    const noNodes = {
      name: 'empty',
      creationTimestamp: '',
      luigiConfigFragment: { data: {} },
    } as unknown as ContentConfiguration;

    expect(() => extractResourceDefinitions([noNodes])).not.toThrow();
    expect(extractResourceDefinitions([noNodes])).toEqual([]);
  });

  it('treats an undefined resourceActions as an empty list when merging', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              permissionsDefinition: {
                group: 'g',
                resource: 'Accounts',
                entityActions: ['get'],
                entityContextKey: 'entityName',
              } as unknown as PermissionsDefinition,
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].permissionsDefinition?.resourceActions).toEqual([]);
  });
});
