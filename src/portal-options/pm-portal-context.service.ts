import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getOrganization } from './utils/domain.js';
import { Injectable } from '@nestjs/common';
import { PortalContextProvider } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import process from 'node:process';

@Injectable()
export class PMPortalContextService implements PortalContextProvider {
  constructor(private kcpKubernetesService: KcpKubernetesService) {}

  async getContextValues(request: Request, response: Response, portalContext: Record<string, any>): Promise<Record<string, any>> {
    this.processGraphQLGatewayApiUrl(request, portalContext);
    this.addKcpWorkspaceUrl(request, portalContext);

    return portalContext;
  }

  private addKcpWorkspaceUrl(request: Request, portalContext: Record<string, any>) {
    const organization = getOrganization(request);
    const account = request.query?.['core_platform-mesh_io_account'];

    portalContext.kcpWorkspaceUrl =
      this.kcpKubernetesService.getKcpWorkspacePublicUrl(organization, account);
  }

  private processGraphQLGatewayApiUrl(
    request: Request,
    portalContext: Record<string, any>,
  ): void {
    const org = getOrganization(request);
    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
    const subDomain = request.hostname !== baseDomain ? `${org}.` : '';
    portalContext.crdGatewayApiUrl = portalContext.crdGatewayApiUrl
      ?.replace('${org-subdomain}', subDomain)
      .replace('${org-name}', org);
  }
}
