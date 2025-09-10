import { PMAuthConfigProvider } from './auth-config-provider.js';
import { OpenmfpPortalContextService } from './openmfp-portal-context.service.js';
import { Injectable } from '@nestjs/common';
import { RequestContextProvider } from '@openmfp/portal-server-lib';
import type { Request } from 'express';

export interface RequestContext extends Record<string, any> {
  account?: string;
  organization: string;
  crdGatewayApiUrl?: string;
  isSubDomain: boolean;
}

@Injectable()
export class RequestContextProviderImpl implements RequestContextProvider {
  constructor(
    private authConfigProvider: PMAuthConfigProvider,
    private openmfpPortalContextService: OpenmfpPortalContextService,
  ) {}

  async getContextValues(request: Request): Promise<RequestContext> {
    const domainData = this.authConfigProvider.getDomain(request);
    return {
      ...request.query,
      ...(await this.openmfpPortalContextService.getContextValues(request)),
      organization: domainData.organization,
      isSubDomain: request.hostname !== domainData.baseDomain,
    };
  }
}
