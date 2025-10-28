import { PortalContext } from './models/luigi-context.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getOrganization } from './utils/domain.js';
import { Injectable } from '@nestjs/common';
import { PortalContextProvider } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import process from 'node:process';

@Injectable()
export class PMPortalContextService implements PortalContextProvider {
  private readonly openmfpPortalContext = 'OPENMFP_PORTAL_CONTEXT_';

  constructor(private kcpKubernetesService: KcpKubernetesService) {}

  getContextValues(request: Request): Promise<PortalContext> {
    const portalContext: PortalContext = {};

    const keys = Object.keys(process.env).filter((item) =>
      item.startsWith(this.openmfpPortalContext),
    );
    keys.forEach((key) => {
      const keyName = key.substring(this.openmfpPortalContext.length).trim();
      if (keyName.length > 0) {
        const camelCaseName = this.toCamelCase(keyName);
        portalContext[camelCaseName] = process.env[key];
      }
    });

    this.processDynamicApiUrls(request, portalContext);
    this.addKcpWorkspaceUrl(request, portalContext);
    return Promise.resolve(portalContext);
  }

  private addKcpWorkspaceUrl(request, portalContext) {
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

  private toCamelCase(text: string): string {
    let firstSegment = true;
    const items = text.split('_').map((item) => {
      if (firstSegment) {
        firstSegment = false;
        return item.toLowerCase();
      }
      return this.capitalizeFirstLetter(item.toLowerCase());
    });
    return items.join('');
  }

  private capitalizeFirstLetter(text: string): string {
    return String(text).charAt(0).toUpperCase() + String(text).slice(1);
  }
}
