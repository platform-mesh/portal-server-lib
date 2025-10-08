import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getDomainAndOrganization } from './utils/domain.js';
import { Injectable } from '@nestjs/common';
import { PortalContextProvider } from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import process from 'node:process';

@Injectable()
export class PMPortalContextService implements PortalContextProvider {
  private readonly openmfpPortalContext = 'OPENMFP_PORTAL_CONTEXT_';

  constructor(private kcpKubernetesService: KcpKubernetesService) {}

  getContextValues(request: Request): Promise<Record<string, any>> {
    const portalContext: Record<string, any> = {};

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

    this.processGraphQLGatewayApiUrl(request, portalContext);
    this.addKcpWorkspaceUrl(request, portalContext);
    return Promise.resolve(portalContext);
  }

  private addKcpWorkspaceUrl(request, portalContext) {
    const { organization } = getDomainAndOrganization(request);
    const account = request.query?.['core_platform-mesh_io_account'];

    portalContext.kcpWorkspaceUrl = this.kcpKubernetesService
      .getKcpWorkspaceUrl(organization, account)
      .toString();
  }

  private processGraphQLGatewayApiUrl(
    request: Request,
    portalContext: Record<string, any>,
  ): void {
    const org = getDomainAndOrganization(request);
    const subDomain =
      request.hostname === org.baseDomain ? '' : `${org.organization}.`;
    portalContext.crdGatewayApiUrl = portalContext.crdGatewayApiUrl
      ?.replace('${org-subdomain}', subDomain)
      .replace('${org-name}', org.organization);
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
