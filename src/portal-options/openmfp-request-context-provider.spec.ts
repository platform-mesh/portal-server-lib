import { PMAuthConfigProvider } from './auth-config-provider.js';
import { OpenmfpPortalContextService } from './openmfp-portal-context.service.js';
import { RequestContextProviderImpl } from './openmfp-request-context-provider.js';
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

describe('RequestContextProviderImpl', () => {
  let provider: RequestContextProviderImpl;
  const pmAuthConfigProviderMock = mock<PMAuthConfigProvider>();
  const portalContext = mock<OpenmfpPortalContextService>();

  beforeEach(() => {
    jest.resetAllMocks();
    (
      pmAuthConfigProviderMock.getDomain as unknown as jest.Mock
    ).mockReturnValue({
      organization: 'org1',
      baseDomain: 'org1.example.com',
    });
    (portalContext.getContextValues as unknown as jest.Mock).mockResolvedValue({
      crdGatewayApiUrl: 'http://gateway/graphql',
      other: 'x',
    });

    provider = new RequestContextProviderImpl(
      pmAuthConfigProviderMock,
      portalContext,
    );
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

    expect(pmAuthConfigProviderMock.getDomain).toHaveBeenCalledWith(req);
    expect(portalContext.getContextValues).toHaveBeenCalledWith(req);
  });
});
