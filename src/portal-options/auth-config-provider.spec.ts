import { PMAuthConfigProvider } from './auth-config-provider.js';
import { IdentityProviderConfiguration } from './models/k8s.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import * as domainUtils from './utils/domain.js';
import { HttpException, HttpStatus } from '@nestjs/common';
import { DiscoveryService } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import { mock } from 'jest-mock-extended';

jest.mock('@kubernetes/client-node', () => {
  const mockReadNamespacedSecret = jest.fn();
  class KubeConfig {
    loadFromDefault = jest.fn();
    loadFromFile = jest.fn();
    getCurrentCluster = jest.fn().mockReturnValue({
      server: 'https://k8s.example.com',
      name: 'test-cluster',
    });
    makeApiClient = jest.fn().mockReturnValue({
      readNamespacedSecret: mockReadNamespacedSecret,
    });
    addUser = jest.fn();
    addContext = jest.fn();
    setCurrentContext = jest.fn();
  }
  class CoreV1Api {}
  class CustomObjectsApi {}
  return { KubeConfig, CoreV1Api, CustomObjectsApi, mockReadNamespacedSecret };
});

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: class {},
}));

describe('PMAuthConfigProvider', () => {
  let provider: PMAuthConfigProvider;
  let discoveryService: jest.Mocked<DiscoveryService>;
  let kcpKubernetesService: jest.Mocked<KcpKubernetesService>;
  let mockRequest: Request;

  const mockOidcDiscovery = {
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
    issuer: 'https://auth.example.com',
    end_session_endpoint: 'https://auth.example.com/logout',
  };

  beforeEach(() => {
    discoveryService = mock<DiscoveryService>();
    kcpKubernetesService = mock<KcpKubernetesService>();
    provider = new PMAuthConfigProvider(discoveryService, kcpKubernetesService);

    mockRequest = { hostname: 'org1.example.com' } as Request;

    process.env = {
      BASE_DOMAINS_DEFAULT: 'example.com',
      AUTH_SERVER_URL_DEFAULT: 'https://default-auth.com/authorize',
      TOKEN_URL_DEFAULT: 'https://default-auth.com/token',
    };

    jest
      .spyOn(domainUtils, 'getDiscoveryEndpoint')
      .mockReturnValue(
        'https://oidc.example.com/.well-known/openid-configuration',
      );
    jest.spyOn(domainUtils, 'getOrganization').mockReturnValue('org1');

    discoveryService.getOIDC.mockResolvedValue(mockOidcDiscovery);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthConfig', () => {
    it('should return auth config for regular organization', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      const result = await provider.getAuthConfig(mockRequest);

      expect(result).toEqual({
        idpName: 'org1',
        baseDomain: 'example.com',
        clientId: 'client-org1',
        clientSecret: 'secret-org1',
        oauthServerUrl: 'https://auth.example.com/authorize',
        oauthTokenUrl: 'https://auth.example.com/token',
        oidcIssuerUrl: 'https://auth.example.com',
        endSessionUrl: 'https://auth.example.com/logout',
      });
      expect(kcpKubernetesService.listClusterCustomObject).toHaveBeenCalledWith(
        {
          group: 'core.platform-mesh.io',
          version: 'v1alpha1',
          plural: 'identityproviderconfigurations',
          name: 'org1',
        },
        { organization: 'org1' },
        'root:orgs',
      );
      expect(kcpKubernetesService.getClientSecret).toHaveBeenCalledWith(
        'secret-org1',
      );
    });

    it('should handle welcome organization', async () => {
      jest.spyOn(domainUtils, 'getOrganization').mockReturnValue('welcome');

      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            welcome: {
              clientId: 'client-welcome',
              secretRef: { name: 'secret-welcome', namespace: 'default' },
            },
          },
        },
      };
      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-welcome');

      const result = await provider.getAuthConfig(mockRequest);

      expect(result.clientId).toBe('client-welcome');
      expect(result.clientSecret).toBe('secret-welcome');
      expect(kcpKubernetesService.listClusterCustomObject).toHaveBeenCalledWith(
        {
          group: 'core.platform-mesh.io',
          name: 'welcome',
          plural: 'identityproviderconfigurations',
          version: 'v1alpha1',
        },
        { organization: 'welcome' },
        'root:platform-mesh-system',
      );
      expect(kcpKubernetesService.getClientSecret).toHaveBeenCalledWith(
        'secret-welcome',
      );
    });

    it('should fall back to default auth URLs when OIDC discovery fails', async () => {
      discoveryService.getOIDC.mockResolvedValue(null);

      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      const result = await provider.getAuthConfig(mockRequest);

      expect(result.oauthServerUrl).toBe('https://default-auth.com/authorize');
      expect(result.oauthTokenUrl).toBe('https://default-auth.com/token');
      expect(result.oidcIssuerUrl).toBeUndefined();
      expect(result.endSessionUrl).toBeUndefined();
    });

    it('should throw HttpException when oauthServerUrl is missing', async () => {
      discoveryService.getOIDC.mockResolvedValue(null);
      process.env.AUTH_SERVER_URL_DEFAULT = '';

      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await expect(provider.getAuthConfig(mockRequest)).rejects.toThrow(
        HttpException,
      );
      await expect(provider.getAuthConfig(mockRequest)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('should throw HttpException when oauthTokenUrl is missing', async () => {
      discoveryService.getOIDC.mockResolvedValue(null);
      process.env.TOKEN_URL_DEFAULT = '';

      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await expect(provider.getAuthConfig(mockRequest)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw HttpException when clientId is missing', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: '',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await expect(provider.getAuthConfig(mockRequest)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw HttpException when clientSecret is missing', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('');

      await expect(provider.getAuthConfig(mockRequest)).rejects.toThrow(
        HttpException,
      );
    });

    it('should include error details in HttpException', async () => {
      discoveryService.getOIDC.mockResolvedValue(null);
      process.env.AUTH_SERVER_URL_DEFAULT = '';

      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      try {
        await provider.getAuthConfig(mockRequest);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.message).toBe('Default auth configuration incomplete.');
        expect(response.error).toContain("oauthServerUrl: ''");
        expect(response.error).toContain('has client secret: true');
      }
    });

    it('should call getDiscoveryEndpoint with request', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await provider.getAuthConfig(mockRequest);

      expect(domainUtils.getDiscoveryEndpoint).toHaveBeenCalledWith(
        mockRequest,
      );
    });

    it('should call getOrganization with request', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await provider.getAuthConfig(mockRequest);

      expect(domainUtils.getOrganization).toHaveBeenCalledWith(mockRequest);
    });

    it('should call discoveryService with OIDC URL', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await provider.getAuthConfig(mockRequest);

      expect(discoveryService.getOIDC).toHaveBeenCalledWith(
        'https://oidc.example.com/.well-known/openid-configuration',
      );
    });
  });

  describe('readClientId', () => {
    it('should read client ID from identity provider configuration', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await provider.getAuthConfig(mockRequest);

      expect(kcpKubernetesService.listClusterCustomObject).toHaveBeenCalledWith(
        {
          group: 'core.platform-mesh.io',
          version: 'v1alpha1',
          plural: 'identityproviderconfigurations',
          name: 'org1',
        },
        {
          organization: 'org1',
        },
        'root:orgs',
      );
    });

    it('should handle missing managedClients', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {},
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      await expect(provider.getAuthConfig(mockRequest)).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined OIDC discovery endpoints', async () => {
      discoveryService.getOIDC.mockResolvedValue({
        authorization_endpoint: undefined,
        token_endpoint: undefined,
        issuer: undefined,
        end_session_endpoint: undefined,
      } as any);

      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue('secret-org1');

      const result = await provider.getAuthConfig(mockRequest);

      expect(result.oauthServerUrl).toBe('https://default-auth.com/authorize');
      expect(result.oauthTokenUrl).toBe('https://default-auth.com/token');
    });

    it('should handle null clientSecret in error message', async () => {
      const mockIdpConfig: IdentityProviderConfiguration = {
        status: {
          managedClients: {
            org1: {
              clientId: 'client-org1',
              secretRef: { name: 'secret-org1', namespace: 'default' },
            },
          },
        },
      } as IdentityProviderConfiguration;

      kcpKubernetesService.listClusterCustomObject.mockResolvedValue(
        mockIdpConfig,
      );
      kcpKubernetesService.getClientSecret.mockResolvedValue(null as any);

      try {
        await provider.getAuthConfig(mockRequest);
        fail('Should have thrown');
      } catch (error) {
        const response = (error as HttpException).getResponse() as any;
        expect(response.error).toContain('has client secret: false');
      }
    });
  });
});
