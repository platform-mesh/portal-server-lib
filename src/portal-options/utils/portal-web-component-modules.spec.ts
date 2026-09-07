import { ContentConfiguration, LuigiNode } from '@openmfp/portal-server-lib';
import { normalizePortalWebComponentModules } from './portal-web-component-modules.js';

const bundle = '/assets/platform-mesh-portal-ui-wc.js';
const origin = 'https://portal.example.test';
const node = (overrides: LuigiNode = {}): LuigiNode => ({
  label: 'Accounts',
  pathSegment: 'accounts',
  url: `${bundle}#generic-list-view`,
  webcomponent: { selfRegistered: true },
  ...overrides,
});
const configuration = (
  nodes: LuigiNode[],
  defaults?: Partial<LuigiNode>,
): ContentConfiguration => ({
  name: 'accounts',
  creationTimestamp: '',
  luigiConfigFragment: { data: { nodes, nodeDefaults: defaults } },
});

describe('normalizePortalWebComponentModules', () => {
  it('repairs the built-in Accounts list and its nested detail view', () => {
    const config = configuration([
      node({
        entityType: 'main',
        children: [
          node({
            pathSegment: ':accountId',
            url: `${bundle}#generic-detail-view`,
          }),
        ],
      }),
    ]);
    normalizePortalWebComponentModules(config);

    const accounts = config.luigiConfigFragment.data.nodes[0];
    expect(accounts.webcomponent).toEqual({
      selfRegistered: true,
      type: 'module',
    });
    expect(accounts.entityType).toBe('main');
    expect((accounts.children as LuigiNode[])[0].webcomponent).toEqual({
      selfRegistered: true,
      type: 'module',
    });
  });

  it('uses each child URL rather than inheriting an iframe parent URL', () => {
    const config = configuration([
      { url: 'https://provider.example.test/index.html', children: [node()] },
    ]);
    normalizePortalWebComponentModules(config);
    const parent = config.luigiConfigFragment.data.nodes[0];
    expect(parent.webcomponent).toBeUndefined();
    expect((parent.children as LuigiNode[])[0].webcomponent).toEqual({
      selfRegistered: true,
      type: 'module',
    });
  });

  it('materializes default web-component settings only for the matching node', () => {
    const defaults = Object.freeze({
      webcomponent: Object.freeze({ selfRegistered: true }),
    });
    const config = configuration(
      [
        { url: `${bundle}#generic-list-view` },
        { url: 'https://provider.example.test/other.js#other-view' },
        { url: `${bundle}#generic-list-view`, webcomponent: false },
      ],
      defaults,
    );
    normalizePortalWebComponentModules(config);

    expect(
      config.luigiConfigFragment.data.nodes.map((n) => n.webcomponent),
    ).toEqual([{ selfRegistered: true, type: 'module' }, undefined, false]);
    expect(defaults.webcomponent).toEqual({ selfRegistered: true });
  });

  it('matches the server shallow merge when a node overrides default type or URL', () => {
    const config = configuration(
      [
        { url: 'https://provider.example.test/index.html' },
        node(),
        { pathSegment: 'inherited' },
      ],
      {
        url: `${bundle}#generic-detail-view`,
        webcomponent: { selfRegistered: true, type: 'classic' },
      },
    );
    normalizePortalWebComponentModules(config);

    expect(
      config.luigiConfigFragment.data.nodes.map((n) => n.webcomponent),
    ).toEqual([undefined, { selfRegistered: true, type: 'module' }, undefined]);
    expect(config.luigiConfigFragment.data.nodeDefaults).toEqual({
      url: `${bundle}#generic-detail-view`,
      webcomponent: { selfRegistered: true, type: 'classic' },
    });
  });

  it('applies global defaults to ordinary children but not to compound views', () => {
    const config = configuration(
      [
        {
          children: [{ url: `${bundle}#generic-list-view` }],
          compound: {
            children: [
              { viewUrl: `${bundle}#generic-list-view` },
              node({
                url: undefined,
                viewUrl: `${bundle}#generic-detail-view`,
              }),
            ],
          },
        },
      ],
      { webcomponent: { selfRegistered: true } },
    );
    normalizePortalWebComponentModules(config);

    const parent = config.luigiConfigFragment.data.nodes[0];
    expect((parent.children as LuigiNode[])[0].webcomponent).toEqual({
      selfRegistered: true,
      type: 'module',
    });
    expect(parent.compound.children[0].webcomponent).toBeUndefined();
    expect(parent.compound.children[1].webcomponent).toEqual({
      selfRegistered: true,
      type: 'module',
    });
  });

  it('copies inherited children without modifying shared defaults', () => {
    const defaults = { children: [node({ children: [] })] };
    const config = configuration(
      [{ pathSegment: 'first' }, { pathSegment: 'second' }],
      defaults,
    );
    normalizePortalWebComponentModules(config);
    for (const parent of config.luigiConfigFragment.data.nodes) {
      expect((parent.children as LuigiNode[])[0].webcomponent).toEqual({
        selfRegistered: true,
        type: 'module',
      });
    }
    expect(defaults.children[0].webcomponent).toEqual({ selfRegistered: true });
  });

  it.each(['module', 'classic', '', null])(
    'preserves explicitly configured type %p',
    (type) => {
      const config = configuration([
        node({ webcomponent: { selfRegistered: true, type } }),
      ]);
      normalizePortalWebComponentModules(config);
      expect(config.luigiConfigFragment.data.nodes[0].webcomponent).toEqual({
        selfRegistered: true,
        type,
      });
    },
  );

  it.each([undefined, false, true, { selfRegistered: false }])(
    'preserves non-self-registered setting %p',
    (webcomponent) => {
      const config = configuration([node({ webcomponent })]);
      normalizePortalWebComponentModules(config);
      expect(config.luigiConfigFragment.data.nodes[0].webcomponent).toEqual(
        webcomponent,
      );
    },
  );

  it.each([
    bundle,
    `${bundle}?v=2#generic-list-view`,
    `${bundle}#generic-detail-view`,
  ])('recognizes the exact portal-owned bundle %s', (url) => {
    const config = configuration([node({ url })]);
    normalizePortalWebComponentModules(config);
    expect(config.luigiConfigFragment.data.nodes[0].webcomponent).toEqual({
      selfRegistered: true,
      type: 'module',
    });
  });

  it.each([
    undefined,
    './assets/platform-mesh-portal-ui-wc.js#generic-list-view',
    `${bundle}.other#generic-list-view`,
    '/assets/openmfp-portal-ui-wc.js#generic-list-view',
    `${origin}${bundle}#generic-list-view`,
    `https://other.example.test${bundle}#generic-list-view`,
    `http://portal.example.test${bundle}#generic-list-view`,
    `https://portal.example.test:8443${bundle}#generic-list-view`,
    `https://user@portal.example.test${bundle}#generic-list-view`,
    `https://:password@portal.example.test${bundle}#generic-list-view`,
    `//portal.example.test${bundle}#generic-list-view`,
    'not a URL',
  ])('preserves an unrelated or unsafe URL %s', (url) => {
    const config = configuration([node({ url })]);
    normalizePortalWebComponentModules(config);
    expect(config.luigiConfigFragment.data.nodes[0].webcomponent).toEqual({
      selfRegistered: true,
    });
  });

  it('does not use a remote provider URL as the portal origin', () => {
    const config = configuration([
      node({ url: `https://provider.example.test${bundle}#generic-list-view` }),
    ]);
    config.url = 'https://provider.example.test/content.json';
    normalizePortalWebComponentModules(config);
    expect(config.luigiConfigFragment.data.nodes[0].webcomponent).toEqual({
      selfRegistered: true,
    });
  });

  it('uses url before viewUrl and does not traverse arbitrary context data', () => {
    const context = { resourceDefinition: { example: node() } };
    const config = configuration([
      node({
        url: 'https://provider.example.test/index.html',
        viewUrl: `${bundle}#generic-list-view`,
        context,
      }),
    ]);
    normalizePortalWebComponentModules(config);
    expect(config.luigiConfigFragment.data.nodes[0].webcomponent).toEqual({
      selfRegistered: true,
    });
    expect(context.resourceDefinition.example.webcomponent).toEqual({
      selfRegistered: true,
    });
  });

  it('preserves function children and supports repeated normalization', () => {
    const children = () => [];
    const config = configuration([node({ children })]);
    normalizePortalWebComponentModules(config);
    const normalized = structuredClone({
      ...config.luigiConfigFragment.data.nodes[0],
      children: undefined,
    });
    normalizePortalWebComponentModules(config);
    expect(config.luigiConfigFragment.data.nodes[0].children).toBe(children);
    expect({
      ...config.luigiConfigFragment.data.nodes[0],
      children: undefined,
    }).toEqual(normalized);
  });

  it.each([
    null,
    {},
    { luigiConfigFragment: {} },
    { luigiConfigFragment: { data: { nodes: null } } },
  ])('ignores absent node structures %p', (value) => {
    expect(() =>
      normalizePortalWebComponentModules(value as ContentConfiguration),
    ).not.toThrow();
  });

  it('preserves malformed scalar nodes without reading their properties', () => {
    const config = configuration([
      null,
      'invalid',
      7,
    ] as unknown as LuigiNode[]);
    normalizePortalWebComponentModules(config);
    expect(config.luigiConfigFragment.data.nodes).toEqual([null, 'invalid', 7]);
  });
});
