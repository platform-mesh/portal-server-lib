import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import { Injectable } from '@nestjs/common';

@Injectable()
export class KcpKubernetesService {
  private readonly k8sApi: CustomObjectsApi;
  private readonly baseUrl: URL;

  constructor() {
    const kubeConfigKcp = process.env['KUBECONFIG_KCP'];
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

  getKcpWorkspacePublicUrl(organization: string, account: string) {
    const path = this.buildWorkspacePath(organization, account);
    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
    return `https://kcp.api.${baseDomain}/clusters/${path}`;
  }
}
