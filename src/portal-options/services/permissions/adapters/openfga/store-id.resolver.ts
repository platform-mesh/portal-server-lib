import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import { Injectable, Logger } from '@nestjs/common';

const STORE_GROUP = 'core.platform-mesh.io';
const STORE_VERSION = 'v1alpha1';
const STORE_PLURAL = 'stores';

const ACCOUNT_INFO_GROUP = 'core.platform-mesh.io';
const ACCOUNT_INFO_VERSION = 'v1alpha1';
const ACCOUNT_INFO_PLURAL = 'accountinfos';
const ACCOUNT_INFO_NAME = 'account';

export interface ResolvedStore {
  storeId: string;
  authorizationModelId: string;
  // kcp.io/cluster of the parent workspace — used as prefix in FGA account object IDs
  originClusterId: string;
  // kcp.io/cluster of the account's own workspace — used as prefix in FGA namespace/resource object IDs
  generatedClusterId: string;
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
      const orgsKcOptions = {
        clusters: [{ name: 'orgs-lookup', server: `${this.kcpOrigin}/clusters/root:orgs`, caData: cluster?.caData, skipTLSVerify: cluster?.skipTLSVerify }],
        users: [{ name: 'orgs-lookup', certData: (user as any)?.certData, keyData: (user as any)?.keyData }],
        contexts: [{ name: 'orgs-lookup', cluster: 'orgs-lookup', user: 'orgs-lookup' }],
        currentContext: 'orgs-lookup',
      };
      kc.loadFromOptions(orgsKcOptions);
      const orgsApi = kc.makeApiClient(CustomObjectsApi);

      const storeResponse = await orgsApi.getClusterCustomObject({
        group: STORE_GROUP,
        version: STORE_VERSION,
        plural: STORE_PLURAL,
        name: organization,
      });

      const storeObj = storeResponse as any;
      const storeId = storeObj?.status?.storeId;
      const authorizationModelId = storeObj?.status?.authorizationModelId ?? '';

      if (!storeId) {
        this.logger.warn(`Store CR "${organization}" found but has no status.storeId yet`);
        return undefined;
      }

      // Read AccountInfo from the account's own workspace to get cluster IDs
      const accountKc = new KubeConfig();
      accountKc.loadFromOptions({
        clusters: [{ name: 'account-lookup', server: `${this.kcpOrigin}/clusters/root:orgs:${organization}`, caData: cluster?.caData, skipTLSVerify: cluster?.skipTLSVerify }],
        users: [{ name: 'account-lookup', certData: (user as any)?.certData, keyData: (user as any)?.keyData }],
        contexts: [{ name: 'account-lookup', cluster: 'account-lookup', user: 'account-lookup' }],
        currentContext: 'account-lookup',
      });
      const accountApi = accountKc.makeApiClient(CustomObjectsApi);

      const accountInfoResponse = await accountApi.getClusterCustomObject({
        group: ACCOUNT_INFO_GROUP,
        version: ACCOUNT_INFO_VERSION,
        plural: ACCOUNT_INFO_PLURAL,
        name: ACCOUNT_INFO_NAME,
      });

      const aiObj = accountInfoResponse as any;
      const originClusterId = aiObj?.spec?.account?.originClusterId ?? '';
      const generatedClusterId = aiObj?.spec?.account?.generatedClusterId ?? '';

      if (!originClusterId || !generatedClusterId) {
        this.logger.warn(`AccountInfo for org "${organization}" missing cluster IDs: originClusterId=${originClusterId}, generatedClusterId=${generatedClusterId}`);
        return undefined;
      }

      const resolved: ResolvedStore = { storeId, authorizationModelId, originClusterId, generatedClusterId };
      this.cache.set(organization, resolved);
      this.logger.log(`Resolved store for org "${organization}": storeId=${storeId} originClusterId=${originClusterId} generatedClusterId=${generatedClusterId}`);
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
