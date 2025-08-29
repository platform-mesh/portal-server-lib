import { Injectable } from '@nestjs/common';
import { EnvService, RequestContextProvider } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import { OpenmfpPortalContextService } from '../portal-context-provider/openmfp-portal-context.service.js';

export interface RequestContext extends Record<string, any> {
  account?: string;
  organization?: string;
  crdGatewayApiUrl?: string;
}

@Injectable()
export class RequestContextProviderImpl implements RequestContextProvider {
  constructor(
    private envService: EnvService,
    private openmfpPortalContextService: OpenmfpPortalContextService
  ) {}

  async getContextValues(request: Request): Promise<RequestContext> {
    return {
      ...request.query,
      ...(await this.openmfpPortalContextService.getContextValues(request)),
      organization: this.envService.getDomain(request).idpName,
    };
  }
}
