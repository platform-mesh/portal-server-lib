import { PortalContext } from './models/luigi-context.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getOrganization } from './utils/domain.js';
import { Injectable } from '@nestjs/common';
import { PortalContextProvider } from '@openmfp/portal-server-lib';
import type { Request, Response } from 'express';
import process from 'node:process';

@Injectable()
export class PMPortalContextService implements PortalContextProvider {
  constructor(private kcpKubernetesService: KcpKubernetesService) {}

  async getContextValues(
    request: Request,
    response: Response,
    portalContext: PortalContext,
  ): Promise<PortalContext> {
    this.processDynamicApiUrls(request, portalContext);
    this.addKcpWorkspaceUrl(request, portalContext);

    return portalContext;
  }

  private addKcpWorkspaceUrl(
    request: Request,
    portalContext: PortalContext,
  ) {
    const organization = getOrganization(request);
    const account = request.query?.['core_platform-mesh_io_account'];

    portalContext.kcpWorkspaceUrl =
      this.kcpKubernetesService.getKcpWorkspacePublicUrl(organization, account);
  }

  private processDynamicApiUrls(
    request: Request,
    portalContext: PortalContext,
  ): void {
    const org = getOrganization(request);
    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
    const subDomain = request.hostname !== baseDomain ? `${org}.` : '';

    const replacements = {
      '${org-subdomain}': subDomain,
      '${org-name}': org,
    };

    const replacePlaceholders = (url?: string) =>
      url
        ? Object.entries(replacements).reduce(
            (acc, [key, value]) => acc.replace(key, value),
            url,
          )
        : url;

    portalContext.crdGatewayApiUrl = replacePlaceholders(
      portalContext.crdGatewayApiUrl,
    );
    portalContext.iamServiceApiUrl = replacePlaceholders(
      portalContext.iamServiceApiUrl,
    );
  }
}
