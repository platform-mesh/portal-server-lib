import { PMPortalContextService } from './pm-portal-context.service.js';
import { PMRequestContextProvider } from './pm-request-context-provider.js';
import { getDomainAndOrganization } from './utils/domain.js';
import type { Request } from 'express';
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

describe('PMRequestContextProvider', () => {
  let provider: PMRequestContextProvider;
  const portalContextService = mock<PMPortalContextService>();
  const mockedGetDomainAndOrganization = jest.mocked(getDomainAndOrganization);

  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetDomainAndOrganization.mockReturnValue({
      organization: 'org1',
      baseDomain: 'org1.example.com',
    });
    (
      portalContextService.getContextValues as unknown as jest.Mock
    ).mockResolvedValue({
      crdGatewayApiUrl: 'http://gateway/graphql',
      other: 'x',
    });

    provider = new PMRequestContextProvider(portalContextService);
  });

  it('should merge request query, portal context and organization from envService', async () => {
    const req = {
      query: { account: 'acc-123', extra: '1' },
      hostname: 'org1.example.com',
    } as unknown as Request;

    const result = await provider.getContextValues(req);

    expect(result).toMatchObject({
      account: 'acc-123',
      extra: '1',
      crdGatewayApiUrl: 'http://gateway/graphql',
      other: 'x',
      organization: 'org1',
    });

    expect(mockedGetDomainAndOrganization).toHaveBeenCalledWith(req);
    expect(portalContextService.getContextValues).toHaveBeenCalledWith(req);
  });
});
