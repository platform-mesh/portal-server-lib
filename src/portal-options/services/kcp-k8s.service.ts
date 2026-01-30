import { K8sRequestContext, K8sResourceDescriptor } from '../models/k8s.js';
import { getOrganization } from '../utils/domain.js';
import {
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from '@kubernetes/client-node';
import { PromiseMiddlewareWrapper } from '@kubernetes/client-node/dist/gen/middleware.js';
import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class KcpKubernetesService {
  private logger: Logger = new Logger(KcpKubernetesService.name);

  private readonly kubeConfigKcp = process.env.KUBECONFIG_KCP;
  private k8sCustomObjectsApiOIDCUser: CustomObjectsApi;
  private k8sCustomObjectsApi: CustomObjectsApi;
  private k8sCoreV1Api: CoreV1Api;
  private baseUrl: URL;

  constructor() {
    this.createK8sCustomObjectsApiForOIDCUser();
    this.createK8sCustomObjectsApi();
    this.createKcpK8sCoreV1Api();
  }

  private createK8sCustomObjectsApiForOIDCUser() {
    const kc = new KubeConfig();
    kc.loadFromFile(this.kubeConfigKcp);
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
    this.k8sCustomObjectsApiOIDCUser = kc.makeApiClient(CustomObjectsApi);
  }

  private createK8sCustomObjectsApi() {
    const kc = new KubeConfig();
    kc.loadFromFile(this.kubeConfigKcp);
    this.k8sCustomObjectsApi = kc.makeApiClient(CustomObjectsApi);
  }

  private createKcpK8sCoreV1Api() {
    const kc = new KubeConfig();
    kc.loadFromFile(this.kubeConfigKcp);
    this.k8sCoreV1Api = kc.makeApiClient(CoreV1Api);
  }

  getKcpK8sCustomObjectsApiOIDCUser() {
    return this.k8sCustomObjectsApiOIDCUser;
  }

  getKcpK8sCustomObjectsApi() {
    return this.k8sCustomObjectsApi;
  }

  getKcpK8sCoreV1Api() {
    return this.k8sCoreV1Api;
  }

  private buildWorkspacePath(organization?: string, account?: string) {
    let path = `root:orgs`;
    if (organization) {
      path += `:${organization}`;
    }
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

  getKcpWorkspaceUrl(organization?: string, account?: string) {
    const path = this.buildWorkspacePath(organization, account);
    return new URL(`${this.baseUrl.origin}/clusters/${path}`);
  }

  getKcpWorkspacePublicUrl(request: Request) {
    const organization = getOrganization(request);
    const account = request.query?.['core_platform-mesh_io_account'];
    const path = this.buildWorkspacePath(organization, account);

    const kcpUrl = process.env.KCP_URL || '';
    if (kcpUrl) {
      return `${kcpUrl}/clusters/${path}`;
    }

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

  public async listClusterCustomObject(
    gvr: K8sResourceDescriptor,
    requestContext: K8sRequestContext,
  ) {
    return await this.k8sCustomObjectsApi.listClusterCustomObject(gvr, {
      middleware: [
        new PromiseMiddlewareWrapper({
          pre: async (context) => {
            const accountPath =
              requestContext?.accountPath ??
              requestContext?.['core_platform-mesh_io_account'];

            const kcpUrl = this.getKcpWorkspaceUrl(
              requestContext.organization,
              accountPath,
            );
            const path = `${kcpUrl}/apis/${gvr.group}/${gvr.version}/${gvr.plural}/${gvr.name}`;
            this.logger.log(`kcp url: ${path}`);
            context.setUrl(path);
            return context;
          },
          post: async (context) => context,
        }),
      ],
    });
  }

  public async getClusterCustomObjectByWorkspacePath(
    gvr: K8sResourceDescriptor,
    workspacePath: string,
  ) {
    return await this.k8sCustomObjectsApi.listClusterCustomObject(gvr, {
      middleware: [
        new PromiseMiddlewareWrapper({
          pre: async (context) => {
            const path = `${this.baseUrl.origin}/clusters/${workspacePath}/apis/${gvr.group}/${gvr.version}/${gvr.plural}/${gvr.name}`;
            this.logger.log(`kcp url: ${path}`);
            context.setUrl(path);
            return context;
          },
          post: async (context) => context,
        }),
      ],
    });
  }

  public async listClusterCustomObjectInKcpVirtualWorkspace(
    gvr: K8sResourceDescriptor,
    requestContext: K8sRequestContext,
    token: string,
  ) {
    return await this.k8sCustomObjectsApiOIDCUser.listClusterCustomObject(gvr, {
      middleware: [
        new PromiseMiddlewareWrapper({
          pre: async (context) => {
            const accountPath =
              requestContext?.accountPath ??
              requestContext?.['core_platform-mesh_io_account'];

            const kcpUrl = this.getKcpVirtualWorkspaceUrl(
              requestContext.organization,
              accountPath,
            );
            const path = `${kcpUrl}/apis/${gvr.group}/${gvr.version}/${gvr.plural}`;
            this.logger.log(`kcp url: ${path}`);

            context.setUrl(path);
            context.setHeaderParam('Authorization', `Bearer ${token}`);
            return context;
          },
          post: async (context) => context,
        }),
      ],
    });
  }

  public async getClientSecret(orgName: string, secretNameOverride?: string) {
    const secretName =
      secretNameOverride ?? `portal-client-secret-${orgName}-${orgName}`;
    const namespace = 'default';

    try {
      const res = await this.k8sCoreV1Api.readNamespacedSecret(
        {
          namespace,
          name: secretName,
        },
        {
          middleware: [
            new PromiseMiddlewareWrapper({
              pre: async (context) => {
                const kcpUrl = this.getKcpWorkspaceUrl();
                const path = `${kcpUrl}/api/v1/namespaces/${namespace}/secrets/${secretName}`;
                this.logger.log(`kcp url: ${path}`);
                context.setUrl(path);
                return context;
              },
              post: async (context) => context,
            }),
          ],
        },
      );
      const secretData = res.data;
      return Buffer.from(secretData['client_secret'], 'base64').toString(
        'utf-8',
      );
    } catch (err) {
      this.logger.error(
        `Failed to fetch secret %s:`,
        secretName,
        err.response?.body || err,
      );
      throw err;
    }
  }
}
