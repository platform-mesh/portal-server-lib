import { OpenmfpPortalContextService } from '../portal-context-provider/openmfp-portal-context.service';
import { RequestContextProviderImpl } from './openmfp-request-context-provider';
import { EnvService } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import { mock } from 'jest-mock-extended';

describe('RequestContextProviderImpl', () => {
  let provider: RequestContextProviderImpl;
  const envService = mock<EnvService>();
  const portalContext = mock<OpenmfpPortalContextService>();

  beforeEach(() => {
    jest.resetAllMocks();
    (envService.getDomain as unknown as jest.Mock).mockReturnValue({
      idpName: 'org1',
      domain: 'org1.example.com',
    });
    (portalContext.getContextValues as unknown as jest.Mock).mockResolvedValue({
      crdGatewayApiUrl: 'http://gateway/graphql',
      other: 'x',
    });

    provider = new RequestContextProviderImpl(
      envService as any,
      portalContext as any,
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

    expect(envService.getDomain).toHaveBeenCalledWith(req);
    expect(portalContext.getContextValues).toHaveBeenCalledWith(req);
  });
});
