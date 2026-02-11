import { K8sRequestContext, K8sResourceDescriptor } from '../models/k8s.js';
import { KcpKubernetesService } from '../services/kcp-k8s.service.js';
import { KubernetesServiceProvidersService } from './kubernetes-service-providers.service.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
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
  PromiseMiddlewareWrapper: class {},
}));

describe('KubernetesServiceProvidersService', () => {
  let service: KubernetesServiceProvidersService;
  let kcpKubernetesServiceMock: jest.Mocked<KcpKubernetesService>;

  const mockToken = 'test-token-123';
  const mockEntities = ['test-entity'];
  const mockContext: K8sRequestContext = {
    organization: 'test-org',
    isSubDomain: true,
  } as K8sRequestContext;

  beforeEach(async () => {
    kcpKubernetesServiceMock = mock<KcpKubernetesService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KubernetesServiceProvidersService,
        {
          provide: KcpKubernetesService,
          useValue: kcpKubernetesServiceMock,
        },
      ],
    }).compile();

    service = module.get<KubernetesServiceProvidersService>(
      KubernetesServiceProvidersService,
    );
  });

  describe('getServiceProviders', () => {
    it('should throw error when token is missing', async () => {
      await expect(
        service.getServiceProviders('', mockEntities, mockContext),
      ).rejects.toThrow('Token is required');
    });

    it('should throw error when token is null', async () => {
      await expect(
        service.getServiceProviders(null as any, mockEntities, mockContext),
      ).rejects.toThrow('Token is required');
    });

    it('should return welcome node config when not subdomain', async () => {
      const context = { ...mockContext, isSubDomain: false };

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        context,
      );

      expect(result).toEqual(welcomeNodeConfig);
      expect(
        kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace,
      ).not.toHaveBeenCalled();
    });

    it('should throw error when organization is null', async () => {
      const context = { isSubDomain: true, organization: null } as any;

      await expect(
        service.getServiceProviders(mockToken, mockEntities, context),
      ).rejects.toThrow('Context with organization is required');
    });

    it('should return empty array when no items in response', async () => {
      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        {
          items: null,
        } as any,
      );

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result).toEqual({ rawServiceProviders: [] });
    });

    it('should return empty array when items is undefined', async () => {
      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        {} as any,
      );

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result).toEqual({ rawServiceProviders: [] });
    });

    it('should parse and return content configurations', async () => {
      const mockContentConfig: ContentConfiguration = {
        url: 'https://test.com/config',
        name: 'Test Config',
      } as ContentConfiguration;

      const mockResponse = {
        items: [
          {
            status: {
              configurationResult: JSON.stringify(mockContentConfig),
            },
            spec: {
              remoteConfiguration: {
                url: 'https://fallback.com',
              },
            },
          },
        ],
      };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result.rawServiceProviders).toHaveLength(1);
      expect(result.rawServiceProviders[0].name).toBe('platform-mesh-system');
      expect(result.rawServiceProviders[0].contentConfiguration).toHaveLength(
        1,
      );
      expect(result.rawServiceProviders[0].contentConfiguration[0].url).toBe(
        'https://test.com/config',
      );
    });

    it('should use fallback url when content configuration has no url', async () => {
      const mockContentConfig: ContentConfiguration = {
        name: 'Test Config',
      } as ContentConfiguration;

      const mockResponse = {
        items: [
          {
            status: {
              configurationResult: JSON.stringify(mockContentConfig),
            },
            spec: {
              remoteConfiguration: {
                url: 'https://fallback.com',
              },
            },
          },
        ],
      };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result.rawServiceProviders[0].contentConfiguration[0].url).toBe(
        'https://fallback.com',
      );
    });

    it('should filter out items without configurationResult', async () => {
      const mockContentConfig: ContentConfiguration = {
        url: 'https://test.com/config',
      } as ContentConfiguration;

      const mockResponse = {
        items: [
          {
            status: {
              configurationResult: JSON.stringify(mockContentConfig),
            },
            spec: {},
          },
          {
            status: {
              configurationResult: null,
            },
            spec: {},
          },
          {
            status: {},
            spec: {},
          },
        ],
      };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result.rawServiceProviders[0].contentConfiguration).toHaveLength(
        1,
      );
    });

    it('should handle multiple content configurations', async () => {
      const mockConfig1: ContentConfiguration = {
        url: 'https://test1.com',
      } as ContentConfiguration;
      const mockConfig2: ContentConfiguration = {
        url: 'https://test2.com',
      } as ContentConfiguration;

      const mockResponse = {
        items: [
          {
            status: {
              configurationResult: JSON.stringify(mockConfig1),
            },
            spec: {},
          },
          {
            status: {
              configurationResult: JSON.stringify(mockConfig2),
            },
            spec: {},
          },
        ],
      };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result.rawServiceProviders[0].contentConfiguration).toHaveLength(
        2,
      );
      expect(result.rawServiceProviders[0].contentConfiguration[0].url).toBe(
        'https://test1.com',
      );
      expect(result.rawServiceProviders[0].contentConfiguration[1].url).toBe(
        'https://test2.com',
      );
    });

    it('should call kubernetes service with correct GVR', async () => {
      const mockResponse = { items: [] };
      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      const expectedGvr: K8sResourceDescriptor = {
        group: 'ui.platform-mesh.io',
        version: 'v1alpha1',
        plural: 'contentconfigurations',
      };

      expect(
        kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledWith(expectedGvr, mockContext, mockToken);
    });

    it('should retry once on 429 error', async () => {
      const error = { code: 429 };
      const mockResponse = { items: [] };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockResponse as any);

      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(global, 'setTimeout');

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(
        kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);

      jest.restoreAllMocks();
    });

    it('should retry once on statusCode 429 error', async () => {
      const error = { statusCode: 429 };
      const mockResponse = { items: [] };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockResponse as any);

      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'log').mockImplementation();

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(
        kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });

    it('should log error on kubernetes service failure', async () => {
      const error = new Error('Kubernetes error');
      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockRejectedValue(
        error,
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(error);

      consoleSpy.mockRestore();
    });

    it('should not retry on non-429 errors', async () => {
      const error = { code: 500 };
      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockRejectedValue(
        error,
      );

      jest.spyOn(console, 'error').mockImplementation();

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(
        kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledTimes(1);

      jest.restoreAllMocks();
    });

    it('should return result after successful retry', async () => {
      const error = { code: 429 };
      const mockContentConfig: ContentConfiguration = {
        url: 'https://test.com',
      } as ContentConfiguration;
      const mockResponse = {
        items: [
          {
            status: {
              configurationResult: JSON.stringify(mockContentConfig),
            },
            spec: {},
          },
        ],
      };

      kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockResponse as any);

      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'log').mockImplementation();

      const result = await service.getServiceProviders(
        mockToken,
        mockEntities,
        mockContext,
      );

      expect(result.rawServiceProviders[0].contentConfiguration).toHaveLength(
        1,
      );
      expect(result.rawServiceProviders[0].contentConfiguration[0].url).toBe(
        'https://test.com',
      );

      jest.restoreAllMocks();
    });
  });

  it('should apply processContentConfigurationForAccountHierarchy when accountPath is provided', async () => {
    kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
      {
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
      },
    );

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
    kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
      {
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
      },
    );

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
    kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
      {
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
      },
    );

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
    kcpKubernetesServiceMock.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
      {
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
      },
    );

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
