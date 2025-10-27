import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getOrganization } from './utils/domain.js';
import { Injectable } from '@nestjs/common';
import { PortalContextProvider } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import process from 'node:process';

@Injectable()
export class PMPortalContextService implements PortalContextProvider {
  constructor(private kcpKubernetesService: KcpKubernetesService) {}

  getContextValues(request: Request): Promise<Record<string, any>> {
    const portalContext: Record<string, any> = {};

    this.processGraphQLGatewayApiUrl(request, portalContext);
    this.addKcpWorkspaceUrl(request, portalContext);
    return Promise.resolve(portalContext);
  }

  private addKcpWorkspaceUrl(request, portalContext) {
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
