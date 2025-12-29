import { K8sRequestContext, K8sResourceDescriptor } from '../models/k8s.js';
import { KcpKubernetesService } from '../services/kcp-k8s.service.js';
import { KubernetesServiceProvidersService } from './kubernetes-service-providers.service.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { mock } from 'jest-mock-extended';

jest.mock('@kubernetes/client-node', () => {});

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: class {},
}));

describe('KubernetesServiceProvidersService', () => {
  let service: KubernetesServiceProvidersService;
  let kcpKubernetesService: jest.Mocked<KcpKubernetesService>;

  const mockToken = 'test-token-123';
  const mockEntities = ['test-entity'];
  const mockContext: K8sRequestContext = {
    organization: 'test-org',
    isSubDomain: true,
  } as K8sRequestContext;

  beforeEach(async () => {
    kcpKubernetesService = mock<KcpKubernetesService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KubernetesServiceProvidersService,
        {
          provide: KcpKubernetesService,
          useValue: kcpKubernetesService,
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
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).not.toHaveBeenCalled();
    });

    it('should throw error when organization is null', async () => {
      const context = { isSubDomain: true, organization: null } as any;

      await expect(
        service.getServiceProviders(mockToken, mockEntities, context),
      ).rejects.toThrow('Context with organization is required');
    });

    it('should return empty array when no items in response', async () => {
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
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
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
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

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
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

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
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

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
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

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
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

    it('should use main entity when entities array is empty', async () => {
      const mockResponse = { items: [] };
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      await service.getServiceProviders(mockToken, [], mockContext);

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          labelSelector: 'ui.platform-mesh.io/entity=main',
        }),
        mockContext,
        mockToken,
      );
    });

    it('should use main entity when entities is null', async () => {
      const mockResponse = { items: [] };
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      await service.getServiceProviders(mockToken, null as any, mockContext);

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          labelSelector: 'ui.platform-mesh.io/entity=main',
        }),
        mockContext,
        mockToken,
      );
    });

    it('should use first entity from array', async () => {
      const mockResponse = { items: [] };
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      await service.getServiceProviders(
        mockToken,
        ['entity1', 'entity2'],
        mockContext,
      );

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          labelSelector: 'ui.platform-mesh.io/entity=entity1',
        }),
        mockContext,
        mockToken,
      );
    });

    it('should call kubernetes service with correct GVR', async () => {
      const mockResponse = { items: [] };
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockResolvedValue(
        mockResponse as any,
      );

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      const expectedGvr: K8sResourceDescriptor = {
        group: 'ui.platform-mesh.io',
        version: 'v1alpha1',
        plural: 'contentconfigurations',
        labelSelector: 'ui.platform-mesh.io/entity=test-entity',
      };

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledWith(expectedGvr, mockContext, mockToken);
    });

    it('should retry once on 429 error', async () => {
      const error = { code: 429 };
      const mockResponse = { items: [] };

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockResponse as any);

      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(global, 'setTimeout');

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);

      jest.restoreAllMocks();
    });

    it('should retry once on statusCode 429 error', async () => {
      const error = { statusCode: 429 };
      const mockResponse = { items: [] };

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockResponse as any);

      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'log').mockImplementation();

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
      ).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });

    it('should log error on kubernetes service failure', async () => {
      const error = new Error('Kubernetes error');
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockRejectedValue(
        error,
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(error);

      consoleSpy.mockRestore();
    });

    it('should not retry on non-429 errors', async () => {
      const error = { code: 500 };
      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace.mockRejectedValue(
        error,
      );

      jest.spyOn(console, 'error').mockImplementation();

      await service.getServiceProviders(mockToken, mockEntities, mockContext);

      expect(
        kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace,
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

      kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace
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
});
