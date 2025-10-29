import { getOrganization } from './utils/domain.js';
import { Injectable } from '@nestjs/common';
import {
  PortalContextProviderImpl,
  RequestContextProvider,
} from '@openmfp/portal-server-lib';
import type { Request, Response } from 'express';

export interface RequestContext extends Record<string, any> {
  account?: string;
  organization: string;
  crdGatewayApiUrl?: string;
  isSubDomain: boolean;
}

@Injectable()
export class PMRequestContextProvider implements RequestContextProvider {
  constructor(private portalContextService: PortalContextProviderImpl) {}

  async getContextValues(
    request: Request,
    response: Response,
  ): Promise<RequestContext> {
    const organization = getOrganization(request);
    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
    return {
      ...request.query,
      ...(await this.portalContextService.getContextValues(request, response)),
      organization,
      isSubDomain: request.hostname !== baseDomain,
    };
  }
}
