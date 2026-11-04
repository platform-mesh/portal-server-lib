import { PMRequestContextProvider } from './pm-request-context-provider.js';
import { getOrganization } from './utils/domain.js';
import { PortalContextProviderImpl } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import { mock } from 'vitest-mock-extended';
import type { Mock } from 'vitest';

vi.mock('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromDefault = vi.fn();
    loadFromFile = vi.fn();
    getCurrentCluster = vi.fn().mockReturnValue({
      server: 'https://k8s.example.com/base',
      name: 'test-cluster',
    });
    makeApiClient = vi.fn();
    addUser = vi.fn();
    addContext = vi.fn();
    setCurrentContext = vi.fn();
  }
  class CustomObjectsApi {}
  return { KubeConfig, CustomObjectsApi };
});

vi.mock('./utils/domain.js', () => ({
  getOrganization: vi.fn(),
}));

describe('PMRequestContextProvider', () => {
  let provider: PMRequestContextProvider;
  const portalContextService = mock<PortalContextProviderImpl>();
  const mockedGetOrganization = vi.mocked(getOrganization);

  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetOrganization.mockReturnValue('org1');
    (
      portalContextService.getContextValues as unknown as Mock
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
    const res = new Response();

    const result = await provider.getContextValues(req, res);

    expect(result).toMatchObject({
      account: 'acc-123',
      extra: '1',
      crdGatewayApiUrl: 'http://gateway/graphql',
      other: 'x',
      organization: 'org1',
    });

    expect(mockedGetOrganization).toHaveBeenCalledWith(req);
    expect(portalContextService.getContextValues).toHaveBeenCalledWith(
      req,
      res,
    );
  });
});
