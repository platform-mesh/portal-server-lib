import { getOrganization } from '../utils/domain.js';
import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class KcpKubernetesService {
  private readonly k8sApi: CustomObjectsApi;
  private readonly baseUrl: URL;

  constructor() {
    const kubeConfigKcp = process.env.KUBECONFIG_KCP;
    const kc = new KubeConfig();
    kc.loadFromFile(kubeConfigKcp);
    // Temporary change to test.
    kc.addUser({
      name: 'oidc',
    });
    kc.addContext({
      name: 'oidc',
      user: 'oidc',
      cluster: kc.getCurrentCluster()?.name || '',
    });
    kc.setCurrentContext('oidc');
    this.baseUrl = new URL(kc.getCurrentCluster()?.server || '');
    this.k8sApi = kc.makeApiClient(CustomObjectsApi);
  }

  getKcpK8sApiClient() {
    return this.k8sApi;
  }

  private buildWorkspacePath(organization: string, account?: string) {
    let path = `root:orgs:${organization}`;
    if (account) {
      path += `:${account}`; // FIXME: how are nested accounts and paths handled in the portal?
    }
    return path;
  }

  getKcpVirtualWorkspaceUrl(organization: string, account: string) {
    const path = this.buildWorkspacePath(organization, account);
    return new URL(
      `${this.baseUrl.origin}/services/contentconfigurations/clusters/${path}`,
    );
  }

  getKcpWorkspaceUrl(organization: string, account: string) {
    const path = this.buildWorkspacePath(organization, account);
    return new URL(`${this.baseUrl.origin}/clusters/${path}`);
  }

  getKcpWorkspacePublicUrl(request: Request) {
    const organization = getOrganization(request);
    const account = request.query?.['core_platform-mesh_io_account'];
    const path = this.buildWorkspacePath(organization, account);

    const baseDomain = process.env.BASE_DOMAINS_DEFAULT;
    const port = this.getAppPort(request);

    return `https://kcp.api.${baseDomain}${port}/clusters/${path}`;
  }

  private getAppPort(request: Request): string {
    const forwardedPort = request.headers['x-forwarded-port'];
    const forwardedPortValue = Array.isArray(forwardedPort)
      ? forwardedPort[0]
      : forwardedPort;
    const requestHostPort = request.headers.host?.split(':')[1];
    const portFromRequest =
      process.env.FRONTEND_PORT || forwardedPortValue || requestHostPort || '';

    const isStandardOrEmptyPort =
      portFromRequest === '80' || portFromRequest === '443' || !portFromRequest;
    return isStandardOrEmptyPort ? '' : `:${portFromRequest}`;
  }
}
