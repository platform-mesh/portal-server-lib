import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import { Injectable, Logger } from '@nestjs/common';

const STORE_GROUP = 'core.platform-mesh.io';
const STORE_VERSION = 'v1alpha1';
const STORE_PLURAL = 'stores';

export interface ResolvedStore {
  storeId: string;
  authorizationModelId: string;
}

@Injectable()
export class StoreIdResolver {
  private readonly logger = new Logger(StoreIdResolver.name);
  private readonly cache = new Map<string, ResolvedStore>();
  private readonly kcpOrigin: string;
  private readonly baseKc: KubeConfig;

  constructor() {
    const kubeconfigKcp = process.env['KUBECONFIG_KCP'];
    this.baseKc = new KubeConfig();
    if (kubeconfigKcp) {
      this.baseKc.loadFromFile(kubeconfigKcp);
      this.kcpOrigin = new URL(this.baseKc.getCurrentCluster()?.server ?? '').origin;
    } else {
      this.kcpOrigin = '';
    }
  }

  async resolve(organization: string): Promise<ResolvedStore | undefined> {
    if (!this.kcpOrigin) return undefined;

    if (this.cache.has(organization)) {
      return this.cache.get(organization);
    }

    try {
      const kc = new KubeConfig();
      const cluster = this.baseKc.getCurrentCluster();
      const user = this.baseKc.getCurrentUser();
      kc.loadFromOptions({
        clusters: [{ name: 'store-lookup', server: `${this.kcpOrigin}/clusters/root:orgs`, caData: cluster?.caData, skipTLSVerify: cluster?.skipTLSVerify }],
        users: [{ name: 'store-lookup', certData: (user as any)?.certData, keyData: (user as any)?.keyData }],
        contexts: [{ name: 'store-lookup', cluster: 'store-lookup', user: 'store-lookup' }],
        currentContext: 'store-lookup',
      });
      const api = kc.makeApiClient(CustomObjectsApi);

      const response = await api.getClusterCustomObject({
        group: STORE_GROUP,
        version: STORE_VERSION,
        plural: STORE_PLURAL,
        name: organization,
      });

      const obj = response as any;
      const storeId = obj?.status?.storeId;
      const authorizationModelId = obj?.status?.authorizationModelId ?? '';

      if (!storeId) {
        this.logger.warn(`Store CR "${organization}" found but has no status.storeId yet`);
        return undefined;
      }

      const resolved: ResolvedStore = { storeId, authorizationModelId };
      this.cache.set(organization, resolved);
      this.logger.log(`Resolved store for org "${organization}": storeId=${storeId}`);
      return resolved;
    } catch (err) {
      this.logger.error(`Failed to resolve Store CR for org "${organization}"`, err);
      return undefined;
    }
  }

  clearCache(organization?: string) {
    if (organization) {
      this.cache.delete(organization);
    } else {
      this.cache.clear();
    }
  }
}
