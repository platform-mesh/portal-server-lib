import { PMPortalContextService } from './pm-portal-context.service.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getDomainAndOrganization } from './utils/domain.js';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { mock } from 'jest-mock-extended';

jest.mock('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromDefault = jest.fn();
    loadFromFile = jest.fn();
    getCurrentCluster = jest.fn().mockReturnValue({
      server: 'https://k8s.example.com/base',
      name: 'test-cluster',
    });
    makeApiClient = jest.fn();
    addUser = jest.fn();
    addContext = jest.fn();
    setCurrentContext = jest.fn();
  }
  class CustomObjectsApi {}
  return { KubeConfig, CustomObjectsApi };
});

jest.mock('./utils/domain.js', () => ({
  getDomainAndOrganization: jest.fn(),
}));

describe('PMPortalContextService', () => {
  let service: PMPortalContextService;
  let kcpKubernetesServiceMock: jest.Mocked<KcpKubernetesService>;
  const mockedGetDomainAndOrganization = jest.mocked(getDomainAndOrganization);
  let mockRequest: any;

  beforeEach(async () => {
    kcpKubernetesServiceMock = mock();

    mockedGetDomainAndOrganization.mockReturnValue({
      baseDomain: 'example.com',
      organization: 'test-org',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PMPortalContextService,
        { provide: KcpKubernetesService, useValue: kcpKubernetesServiceMock },
      ],
    }).compile();

    service = module.get<PMPortalContextService>(PMPortalContextService);
    mockRequest = {
      hostname: 'test.example.com',
    };

    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return context with kcp workspace url', async () => {
    kcpKubernetesServiceMock.getKcpWorkspaceUrl.mockReturnValue(
      new URL('https://k8s.example.com/clusters/root:orgs:test-org'),
    );

    const result = await service.getContextValues(mockRequest as Request);

    expect(result).toEqual({
      kcpWorkspaceUrl: 'https://k8s.example.com/clusters/root:orgs:test-org',
    });
  });

  it('should return empty context when no environment variables match prefix', async () => {
    const result = await service.getContextValues(mockRequest as Request);

    expect(result).toEqual({});
  });

  it('should process environment variables with correct prefix', async () => {
    process.env.OPENMFP_PORTAL_CONTEXT_TEST_KEY = 'test-value';
    process.env.OPENMFP_PORTAL_CONTEXT_ANOTHER_TEST_KEY = 'another-value';
    process.env.OTHER_ENV_VAR = 'should-be-ignored';

    try {
      mockedGetDomainAndOrganization.mockReturnValue({
        baseDomain: 'example.com',
        organization: 'test-org',
      });

      const result = await service.getContextValues(mockRequest as Request);

      expect(result).toEqual({
        testKey: 'test-value',
        anotherTestKey: 'another-value',
      });
    } finally {
      delete process.env.OPENMFP_PORTAL_CONTEXT_TEST_KEY;
      delete process.env.OPENMFP_PORTAL_CONTEXT_ANOTHER_TEST_KEY;
      delete process.env.OTHER_ENV_VAR;
    }
  });

  it('should convert snake_case to camelCase', async () => {
    process.env.OPENMFP_PORTAL_CONTEXT_SNAKE_CASE_KEY = 'value';
    process.env.OPENMFP_PORTAL_CONTEXT_MULTIPLE_SNAKE_CASE_KEYS = 'value2';

    try {
      mockedGetDomainAndOrganization.mockReturnValue({
        baseDomain: 'example.com',
        organization: 'test-org',
      });

      const result = await service.getContextValues(mockRequest as Request);

      expect(result).toEqual({
        snakeCaseKey: 'value',
        multipleSnakeCaseKeys: 'value2',
      });
    } finally {
      delete process.env.OPENMFP_PORTAL_CONTEXT_SNAKE_CASE_KEY;
      delete process.env.OPENMFP_PORTAL_CONTEXT_MULTIPLE_SNAKE_CASE_KEYS;
    }
  });

  it('should process GraphQL gateway API URL with subdomain when hostname differs from domain', async () => {
    process.env.OPENMFP_PORTAL_CONTEXT_CRD_GATEWAY_API_URL =
      'https://${org-subdomain}api.example.com/${org-name}/graphql';

    try {
      mockedGetDomainAndOrganization.mockReturnValue({
        baseDomain: 'example.com',
        organization: 'test-org',
      });

      mockRequest.hostname = 'subdomain.example.com';

      const result = await service.getContextValues(mockRequest as Request);

      expect(result.crdGatewayApiUrl).toBe(
        'https://test-org.api.example.com/test-org/graphql',
      );
    } finally {
      delete process.env.OPENMFP_PORTAL_CONTEXT_CRD_GATEWAY_API_URL;
    }
  });

  it('should process GraphQL gateway API URL without subdomain when hostname matches domain', async () => {
    process.env.OPENMFP_PORTAL_CONTEXT_CRD_GATEWAY_API_URL =
      'https://${org-subdomain}api.example.com/${org-name}/graphql';

    try {
      mockedGetDomainAndOrganization.mockReturnValue({
        baseDomain: 'example.com',
        organization: 'test-org',
      });

      mockRequest.hostname = 'example.com';

      const result = await service.getContextValues(mockRequest as Request);

      expect(result.crdGatewayApiUrl).toBe(
        'https://api.example.com/test-org/graphql',
      );
    } finally {
      delete process.env.OPENMFP_PORTAL_CONTEXT_CRD_GATEWAY_API_URL;
    }
  });

  it('should ignore keys with empty names after trimming', async () => {
    process.env.OPENMFP_PORTAL_CONTEXT_ = 'should-be-ignored';
    process.env['OPENMFP_PORTAL_CONTEXT_   '] = 'should-also-be-ignored';
    process.env.OPENMFP_PORTAL_CONTEXT_VALID_KEY = 'valid-value';

    try {
      mockedGetDomainAndOrganization.mockReturnValue({
        baseDomain: 'example.com',
        organization: 'test-org',
      });

      const result = await service.getContextValues(mockRequest as Request);

      expect(result).toEqual({
        validKey: 'valid-value',
      });
    } finally {
      delete process.env.OPENMFP_PORTAL_CONTEXT_;
      delete process.env['OPENMFP_PORTAL_CONTEXT_   '];
      delete process.env.OPENMFP_PORTAL_CONTEXT_VALID_KEY;
    }
  });

  it('should handle undefined crdGatewayApiUrl gracefully', async () => {
    process.env.OPENMFP_PORTAL_CONTEXT_OTHER_KEY = 'value';

    try {
      const result = await service.getContextValues(mockRequest as Request);

      expect(result).toEqual({
        otherKey: 'value',
      });
    } finally {
      delete process.env.OPENMFP_PORTAL_CONTEXT_OTHER_KEY;
    }
  });
});
