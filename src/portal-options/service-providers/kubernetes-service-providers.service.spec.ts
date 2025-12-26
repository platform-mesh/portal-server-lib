import { KcpKubernetesService } from '../services/kcp-k8s.service.js';
import { KubernetesServiceProvidersService } from './kubernetes-service-providers.service.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';
import { mock } from 'jest-mock-extended';

const listClusterCustomObject = jest.fn();

jest.mock('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromDefault = jest.fn();
    loadFromFile = jest.fn();
    getCurrentCluster = jest.fn().mockReturnValue({
      server: 'https://k8s.example.com/base',
      name: 'test-cluster',
    });
    makeApiClient = jest.fn().mockImplementation(() => ({
      listClusterCustomObject,
    }));
    addUser = jest.fn();
    addContext = jest.fn();
    setCurrentContext = jest.fn();
  }
  class CustomObjectsApi {}
  return { KubeConfig, CustomObjectsApi };
});

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: class {
    pre?: (ctx: any) => Promise<any> | any;
    post?: (ctx: any) => Promise<any> | any;
    constructor(opts: any) {
      this.pre = opts.pre;
      this.post = opts.post;
    }
  },
}));

describe('KubernetesServiceProvidersService', () => {
  let kcpKubernetesServiceMock: jest.Mocked<KcpKubernetesService>;

  beforeEach(() => {
    jest.resetAllMocks();
    kcpKubernetesServiceMock = mock();
    kcpKubernetesServiceMock.getKcpWorkspaceUrl.mockReturnValue(
      new URL('https://k8s.example.com/clusters/root:orgs:test-org'),
    );
    kcpKubernetesServiceMock.getKcpK8sApiClient.mockReturnValue({
      listClusterCustomObject,
    } as any);
  });

  it('throws if token is missing', async () => {
    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    await expect(
      svc.getServiceProviders('', ['entity'], {
        token: undefined,
      }),
    ).rejects.toThrow('Token is required');
  });

  it('throws if context organization is missing', async () => {
    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    await expect(
      svc.getServiceProviders('token', ['entity'], {
        token: 'token',
        organization: undefined,
        isSubDomain: true,
      }),
    ).rejects.toThrow('Context with organization is required');
  });

  it('returns welcome node config when on the base domain', async () => {
    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const result = await svc.getServiceProviders('token', ['entity'], {
      organization: undefined,
      isSubDomain: false,
    });

    expect(result).toEqual(welcomeNodeConfig);
  });

  it('should return empty list when API returns no items', async () => {
    listClusterCustomObject.mockImplementation(
      async (_gvr: any, _opts: any) => {
        return {};
      },
    );

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const res = await svc.getServiceProviders('token', [], {
      organization: 'org',
      isSubDomain: true,
    });
    expect(res.rawServiceProviders).toEqual([]);
  });

  it('should map items to contentConfiguration and fill url from spec when missing', async () => {
    let capturedUrl = '';
    const ctx = {
      _url: 'https://k8s.example.com/base',
      getUrl() {
        return this._url;
      },
      setUrl(u: string) {
        this._url = u;
      },
      setHeaderParam: jest.fn(),
    };
    listClusterCustomObject.mockImplementation(async (_gvr: any, opts: any) => {
      const mw = opts?.middleware?.[0];
      if (mw?.pre) await mw.pre(ctx);
      capturedUrl = ctx._url;
      return {
        items: [
          {
            status: { configurationResult: JSON.stringify({}) },
            spec: {
              remoteConfiguration: { url: 'http://fallback.example/app' },
            },
          },
        ],
      };
    });
    kcpKubernetesServiceMock.getKcpVirtualWorkspaceUrl.mockReturnValue(
      new URL(
        'https://k8s.example.com/services/contentconfigurations/clusters/root:orgs:acme:a1',
      ),
    );

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const res = await svc.getServiceProviders('token', ['main'], {
      organization: 'acme',
      isSubDomain: true,
      'core_platform-mesh_io_account': 'a1',
    });

    expect(res.rawServiceProviders[0].contentConfiguration).toHaveLength(1);
    expect(res.rawServiceProviders[0].contentConfiguration[0].url).toBe(
      'http://fallback.example/app',
    );

    expect(capturedUrl).toEqual(
      'https://k8s.example.com/services/contentconfigurations/clusters/root:orgs:acme:a1/apis/ui.platform-mesh.io/v1alpha1/contentconfigurations',
    );
    expect(ctx.setHeaderParam).toHaveBeenCalledWith(
      'Authorization',
      `Bearer token`,
    );
  });

  it('should retry once on HTTP 429 and log retry message', async () => {
    jest.useFakeTimers();
    const sequence: any[] = [
      Object.assign(new Error('Too Many Requests'), { code: 429 }),
      { items: [] },
    ];
    listClusterCustomObject.mockImplementation(async () => {
      const next = sequence.shift();
      if (next instanceof Error || next?.code === 429) {
        throw next;
      }
      return next;
    });

    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined as unknown as never);
    const errSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined as unknown as never);

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const promise = svc.getServiceProviders('token', [], {
      organization: 'org',
      isSubDomain: true,
    });

    await jest.advanceTimersByTimeAsync(1000);

    const res = await promise;
    expect(res.rawServiceProviders).toEqual([
      {
        name: 'platform-mesh-system',
        displayName: '',
        creationTimestamp: '',
        contentConfiguration: [],
      },
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      'Retry after 1 second reading kubernetes resources.',
    );

    logSpy.mockRestore();
    errSpy.mockRestore();
    jest.useRealTimers();
  });

  it('should apply processContentConfigurationForAccountHierarchy when accountPath is provided', async () => {
    listClusterCustomObject.mockResolvedValue({
      items: [
        {
          status: {
            configurationResult: JSON.stringify({
              name: 'test-config',
              luigiConfigFragment: {
                data: {
                  nodes: [{ entityType: 'core_platform-mesh_io_account' }],
                },
              },
            }),
          },
          spec: { remoteConfiguration: { url: 'http://example.com' } },
        },
      ],
    });

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const res = await svc.getServiceProviders('token', ['main'], {
      organization: 'org',
      isSubDomain: true,
      accountPath: 'acc1',
    });

    expect(
      res.rawServiceProviders[0].contentConfiguration[0].luigiConfigFragment
        .data.nodes[0].entityType,
    ).toBe('core_platform-mesh_io_account:1');
  });

  it('should apply processContentConfigurationForAccountHierarchy with multi-level accountPath', async () => {
    listClusterCustomObject.mockResolvedValue({
      items: [
        {
          status: {
            configurationResult: JSON.stringify({
              name: 'test-config',
              luigiConfigFragment: {
                data: {
                  nodes: [{ entityType: 'core_platform-mesh_io_account' }],
                },
              },
            }),
          },
          spec: { remoteConfiguration: { url: 'http://example.com' } },
        },
      ],
    });

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const res = await svc.getServiceProviders('token', ['main'], {
      organization: 'org',
      isSubDomain: true,
      accountPath: 'acc1:acc2:acc3',
    });

    expect(
      res.rawServiceProviders[0].contentConfiguration[0].luigiConfigFragment
        .data.nodes[0].entityType,
    ).toBe(
      'core_platform-mesh_io_account:1.core_platform-mesh_io_account:2.core_platform-mesh_io_account:3',
    );
  });

  it('should update account children nodes for accounts configuration with accountPath', async () => {
    listClusterCustomObject.mockResolvedValue({
      items: [
        {
          status: {
            configurationResult: JSON.stringify({
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
            }),
          },
          spec: { remoteConfiguration: { url: 'http://example.com' } },
        },
      ],
    });

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const res = await svc.getServiceProviders('token', ['main'], {
      organization: 'org',
      isSubDomain: true,
      accountPath: 'acc1',
    });

    const childNode =
      res.rawServiceProviders[0].contentConfiguration[0].luigiConfigFragment
        .data.nodes[0].children[0];

    expect(childNode.defineEntity.id).toBe('core_platform-mesh_io_account:2');
    expect(childNode.pathSegment).toBe(':core_platform-mesh_io_accountId:2');
  });

  it('should not apply processContentConfigurationForAccountHierarchy when accountPath is not provided', async () => {
    listClusterCustomObject.mockResolvedValue({
      items: [
        {
          status: {
            configurationResult: JSON.stringify({
              name: 'test-config',
              luigiConfigFragment: {
                data: {
                  nodes: [{ entityType: 'core_platform-mesh_io_account' }],
                },
              },
            }),
          },
          spec: { remoteConfiguration: { url: 'http://example.com' } },
        },
      ],
    });

    const svc = new KubernetesServiceProvidersService(kcpKubernetesServiceMock);
    const res = await svc.getServiceProviders('token', ['main'], {
      organization: 'org',
      isSubDomain: true,
    });

    expect(
      res.rawServiceProviders[0].contentConfiguration[0].luigiConfigFragment
        .data.nodes[0].entityType,
    ).toBe('core_platform-mesh_io_account');
  });
});
