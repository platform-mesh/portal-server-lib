import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { extractResourceDefinitions } from './extract-resource-definitions.util.js';

function makeCC(nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes']): ContentConfiguration {
  return {
    name: 'test',
    creationTimestamp: '',
    luigiConfigFragment: { data: { nodes } },
  };
}

describe('extractResourceDefinitions', () => {
  it('returns empty array for empty input', () => {
    expect(extractResourceDefinitions([])).toEqual([]);
  });

  it('returns empty array when no nodes have checkActions', () => {
    const cc = makeCC([{ context: { resourceDefinition: { entity: 'foo' } } }]);
    expect(extractResourceDefinitions([cc])).toEqual([]);
  });

  it('extracts a single resource with string[] actions', () => {
    const cc = makeCC([
      {
        context: {
          resourceDefinition: {
            entity: 'pods',
            checkActions: ['get', 'list'],
          },
        },
      },
    ]);
    expect(extractResourceDefinitions([cc])).toEqual([
      { resource: 'pods', actions: ['get', 'list'] },
    ]);
  });

  it('extracts a resource with actions = "All"', () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'secrets', checkActions: 'All' } } },
    ]);
    expect(extractResourceDefinitions([cc])).toEqual([
      { resource: 'secrets', actions: 'All' },
    ]);
  });

  it('merges actions from two nodes for the same resource', () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get'] } } },
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['list'] } } },
    ]);
    const result = extractResourceDefinitions([cc]);
    expect(result).toHaveLength(1);
    expect(result[0].resource).toBe('pods');
    expect(result[0].actions).toEqual(expect.arrayContaining(['get', 'list']));
  });

  it('"All" wins over a prior string[] for the same resource', () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get'] } } },
      { context: { resourceDefinition: { entity: 'pods', checkActions: 'All' } } },
    ]);
    expect(extractResourceDefinitions([cc])).toEqual([
      { resource: 'pods', actions: 'All' },
    ]);
  });

  it('"All" wins even when it comes first', () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: 'All' } } },
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get'] } } },
    ]);
    expect(extractResourceDefinitions([cc])).toEqual([
      { resource: 'pods', actions: 'All' },
    ]);
  });

  it('deduplicates actions within the same resource across nodes', () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get', 'list'] } } },
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['list', 'watch'] } } },
    ]);
    const result = extractResourceDefinitions([cc]);
    expect((result[0].actions as string[]).sort()).toEqual(['get', 'list', 'watch']);
  });

  it('recurses into node.children', () => {
    const cc = makeCC([
      {
        context: {},
        children: [
          { context: { resourceDefinition: { entity: 'deployments', checkActions: ['create'] } } },
        ],
      },
    ]);
    expect(extractResourceDefinitions([cc])).toEqual([
      { resource: 'deployments', actions: ['create'] },
    ]);
  });

  it('collects resources across multiple ContentConfigurations', () => {
    const cc1 = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get'] } } },
    ]);
    const cc2 = makeCC([
      { context: { resourceDefinition: { entity: 'services', checkActions: ['list'] } } },
    ]);
    const result = extractResourceDefinitions([cc1, cc2]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.resource)).toEqual(
      expect.arrayContaining(['pods', 'services']),
    );
  });

  it('ignores nodes without a context', () => {
    const cc = makeCC([{ pathSegment: 'home' }]);
    expect(extractResourceDefinitions([cc])).toEqual([]);
  });

  it('handles missing luigiConfigFragment gracefully', () => {
    const cc = { name: 'x', creationTimestamp: '' } as ContentConfiguration;
    expect(extractResourceDefinitions([cc])).toEqual([]);
  });
});
