import { PMPortalContextService } from './pm-portal-context.service.js';
import { getDomainAndOrganization } from './utils/domain.js';
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
export class PMRequestContextProvider implements RequestContextProvider {
  constructor(private pmPortalContextService: PMPortalContextService) {}

  async getContextValues(request: Request): Promise<RequestContext> {
    const domainData = getDomainAndOrganization(request);
    return {
      ...request.query,
      ...(await this.pmPortalContextService.getContextValues(request)),
      organization: domainData.organization,
      isSubDomain: request.hostname !== domainData.baseDomain,
    };
  }
}
