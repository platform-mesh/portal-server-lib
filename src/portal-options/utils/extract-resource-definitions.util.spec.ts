import { ContentConfiguration } from '@openmfp/portal-server-lib';
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
              apiGroup: 'foo',
              checkActionsForResource: ['get'],
            },
          },
        },
      ]),
    ]);
    expect(result).toEqual([]);
  });

  it('ignores resourceDefinition with entity but without any action field', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
              apiGroup: 'foo',
              entityCollection: 'foos',
              // no checkActionsForResource, no checkActionsForInstance
            },
          },
        },
      ]),
    ]);
    expect(result).toEqual([]);
  });

  it('collects resourceDefinition with checkActionsForResource', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              apiGroup: 'core.example.com',
              entityCollection: 'Accounts',
              scope: 'Cluster',
              version: 'v1',
              checkActionsForResource: ['get', 'delete'],
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entity: 'Account',
      apiGroup: 'core.example.com',
      checkActionsForResource: ['get', 'delete'],
    });
  });

  it('collects resourceDefinition with checkActionsForInstance only', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Pod',
              entityCollection: 'pods',
              checkActionsForInstance: ['patch', 'delete'],
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].checkActionsForInstance).toEqual(['patch', 'delete']);
    expect(result[0].checkActionsForResource).toBeUndefined();
  });

  it('collects resourceDefinition with both action fields', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
              entityCollection: 'foos',
              checkActionsForResource: ['list'],
              checkActionsForInstance: ['get'],
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].checkActionsForResource).toEqual(['list']);
    expect(result[0].checkActionsForInstance).toEqual(['get']);
  });

  it('merges duplicate entities across nodes with set-dedup on checkActionsForResource', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              entityCollection: 'accounts',
              checkActionsForResource: ['get', 'list'],
            },
          },
        },
        {
          context: {
            resourceDefinition: {
              entity: 'Account',
              entityCollection: 'accounts',
              checkActionsForResource: ['list', 'delete'],
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe('Account');
    // 'list' appears in both → deduplicated
    expect(result[0].checkActionsForResource).toEqual(['get', 'list', 'delete']);
  });

  it('merges duplicate entities across content configurations with set-dedup on checkActionsForInstance', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Pod',
              entityCollection: 'pods',
              checkActionsForInstance: ['get', 'patch'],
            },
          },
        },
      ]),
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Pod',
              entityCollection: 'pods',
              checkActionsForInstance: ['patch', 'delete'],
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].checkActionsForInstance).toEqual(['get', 'patch', 'delete']);
  });

  it('merges when one entry has resource actions and another has instance actions', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
              entityCollection: 'foos',
              checkActionsForResource: ['list'],
            },
          },
        },
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
              entityCollection: 'foos',
              checkActionsForInstance: ['get'],
            },
          },
        },
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].checkActionsForResource).toEqual(['list']);
    expect(result[0].checkActionsForInstance).toEqual(['get']);
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
                  entityCollection: 'nestedentities',
                  checkActionsForResource: ['get'],
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
                      entityCollection: 'deepentities',
                      checkActionsForResource: ['list'],
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
              entityCollection: 'alphas',
              checkActionsForResource: ['get'],
            },
          },
        },
      ]),
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Beta',
              entityCollection: 'betas',
              checkActionsForResource: ['list'],
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

  it('preserves version field from resource definition', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
              entityCollection: 'foos',
              version: 'v1beta1',
              checkActionsForResource: ['get'],
            },
          },
        },
      ]),
    ]);

    expect(result[0].version).toBe('v1beta1');
  });

  it('preserves namespace field from resource definition', () => {
    const result = extractResourceDefinitions([
      makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Bar',
              entityCollection: 'bars',
              namespace: 'my-namespace',
              checkActionsForResource: ['get'],
            },
          },
        },
      ]),
    ]);

    expect(result[0].namespace).toBe('my-namespace');
  });
});
