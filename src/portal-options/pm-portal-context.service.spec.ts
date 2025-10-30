import { PMPortalContextService } from './pm-portal-context.service.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getOrganization } from './utils/domain.js';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { mock } from 'jest-mock-extended';
import process from 'node:process';

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
  getOrganization: jest.fn(),
}));

describe('PMPortalContextService', () => {
  let service: PMPortalContextService;
  let kcpKubernetesServiceMock: jest.Mocked<KcpKubernetesService>;
  const mockedGetDomainAndOrganization = jest.mocked(getOrganization);
  let mockRequest: any;

  beforeEach(async () => {
    kcpKubernetesServiceMock = mock();

    mockedGetDomainAndOrganization.mockReturnValue('test-org');

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
    kcpKubernetesServiceMock.getKcpWorkspacePublicUrl.mockReturnValue(
      'https://kcp.api.example.com/',
    );

    const result = await service.getContextValues(
      mockRequest as Request,
      new Response(),
      {},
    );

    expect(result).toEqual({
      kcpWorkspaceUrl: 'https://kcp.api.example.com/',
    });
  });

  it('should return empty context when no environment variables match prefix', async () => {
    const result = await service.getContextValues(
      mockRequest as Request,
      new Response(),
      {},
    );

    expect(result).toEqual({});
  });

  it('should process GraphQL gateway API URL with subdomain when hostname differs from domain', async () => {
    mockedGetDomainAndOrganization.mockReturnValue('test-org');

    mockRequest.hostname = 'subdomain.example.com';

    const result = await service.getContextValues(
      mockRequest as Request,
      new Response(),
      {
        crdGatewayApiUrl:
          'https://${org-subdomain}api.example.com/${org-name}/graphql',
      },
    );

    expect(result.crdGatewayApiUrl).toBe(
      'https://test-org.api.example.com/test-org/graphql',
    );
  });

  it('should process GraphQL IAM API URL with subdomain', async () => {
    mockedGetDomainAndOrganization.mockReturnValue('test-org');

    mockRequest.hostname = 'example.com';

    const result = await service.getContextValues(
      mockRequest as Request,
      new Response(),
      { iamServiceApiUrl: 'https://${org-subdomain}example.com/iam/graphql' },
    );

    expect(result.iamServiceApiUrl).toBe(
      'https://test-org.example.com/iam/graphql',
    );
  });

  it('should process GraphQL gateway API URL without subdomain when hostname matches domain', async () => {
    mockedGetDomainAndOrganization.mockReturnValue('test-org');
    process.env['BASE_DOMAINS_DEFAULT'] = 'example.com';
    mockRequest.hostname = 'example.com';

    const result = await service.getContextValues(
      mockRequest as Request,
      new Response(),
      {
        crdGatewayApiUrl:
          'https://${org-subdomain}api.example.com/${org-name}/graphql',
      },
    );

    expect(result.crdGatewayApiUrl).toBe(
      'https://api.example.com/test-org/graphql',
    );
  });

  it('should handle undefined crdGatewayApiUrl gracefully', async () => {
    const result = await service.getContextValues(
      mockRequest as Request,
      new Response(),
      { otherKey: 'value' },
    );

    expect(result).toEqual({
      otherKey: 'value',
    });
  });
});
