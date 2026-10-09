import { PromiseMiddlewareWrapper } from '@kubernetes/client-node/dist/gen/middleware.js';
import { Injectable } from '@nestjs/common';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import type {
  ApiExportEntry,
  CreatePolicyRequest,
  OrgEntry,
  PolicyEntry,
  UpdatePolicyRequest,
} from './platform-admin.types.js';

interface Gvr { group: string; version: string; plural: string; }

const GVR_WORKSPACE: Gvr = { group: 'tenancy.kcp.io', version: 'v1alpha1', plural: 'workspaces' };
const GVR_APIEXPORT: Gvr = { group: 'apis.kcp.io', version: 'v1alpha2', plural: 'apiexports' };
const POLICY_GROUP = 'core.platform-mesh.io';
const POLICY_VERSION = 'v1alpha1';
const POLICY_PLURAL = 'apiexportpolicies';
const GVR_POLICY: Gvr = { group: POLICY_GROUP, version: POLICY_VERSION, plural: POLICY_PLURAL };
const WORKSPACE_PROVIDERS = 'root:providers';
const WORKSPACE_ORGS = 'root:orgs';
const CORE_KCP_EXPORTS = new Set<string>([
  'tenancy.kcp.io', 'cache.kcp.io', 'migration.kcp.io', 'topology.kcp.io', 'shards.core.kcp.io',
]);

interface NamedResource { metadata: { name: string }; }
interface PolicyResource {
  metadata: { name: string };
  spec?: { apiExportRef?: { name: string; clusterPath: string }; allowPathExpressions?: string[]; };
}
interface K8sList<T> { items?: T[]; }

@Injectable()
export class PlatformAdminService {
  constructor(private readonly kcpK8s: KcpKubernetesService) {}

  async listApiExports(): Promise<ApiExportEntry[]> {
    const providers = (await this.list<NamedResource>(WORKSPACE_PROVIDERS, GVR_WORKSPACE)).map(w => w.metadata.name);
    const nested = await Promise.all(providers.map(async provider => {
      const clusterPath = `${WORKSPACE_PROVIDERS}:${provider}`;
      const exports = await this.list<NamedResource>(clusterPath, GVR_APIEXPORT);
      return exports
        .map(e => e.metadata.name)
        .filter(name => !CORE_KCP_EXPORTS.has(name))
        .map(name => ({ name, clusterPath }));
    }));
    return nested.flat();
  }

  async listOrgs(): Promise<OrgEntry[]> {
    const workspaces = await this.list<NamedResource>(WORKSPACE_ORGS, GVR_WORKSPACE);
    return workspaces.map(w => ({ name: w.metadata.name }));
  }

  async listPolicies(): Promise<PolicyEntry[]> {
    const policies = await this.list<PolicyResource>(WORKSPACE_ORGS, GVR_POLICY);
    return policies.map(p => ({
      name: p.metadata.name,
      apiExportRef: p.spec?.apiExportRef ?? { name: '', clusterPath: '' },
      allowPathExpressions: p.spec?.allowPathExpressions ?? [],
    }));
  }

  async createPolicy(dto: CreatePolicyRequest): Promise<void> {
    const body = {
      apiVersion: `${POLICY_GROUP}/${POLICY_VERSION}`,
      kind: 'APIExportPolicy',
      metadata: { name: dto.name },
      spec: {
        apiExportRef: { name: dto.apiExportName, clusterPath: dto.clusterPath },
        allowPathExpressions: dto.allowPathExpressions,
      },
    };
    await this.kcpK8s.getKcpK8sCustomObjectsApi().createClusterCustomObject(
      { group: POLICY_GROUP, version: POLICY_VERSION, plural: POLICY_PLURAL, body },
      this.urlOptions(this.collectionUrl(WORKSPACE_ORGS, GVR_POLICY)),
    );
  }

  async updatePolicy(name: string, dto: UpdatePolicyRequest): Promise<void> {
    const url = `${this.collectionUrl(WORKSPACE_ORGS, GVR_POLICY)}/${name}`;
    await this.kcpK8s.getKcpK8sCustomObjectsApi().patchClusterCustomObject(
      {
        group: POLICY_GROUP,
        version: POLICY_VERSION,
        plural: POLICY_PLURAL,
        name,
        body: { spec: { allowPathExpressions: dto.allowPathExpressions } },
      },
      this.urlOptions(url, 'application/merge-patch+json'),
    );
  }

  async deletePolicy(name: string): Promise<void> {
    const url = `${this.collectionUrl(WORKSPACE_ORGS, GVR_POLICY)}/${name}`;
    await this.kcpK8s.getKcpK8sCustomObjectsApi().deleteClusterCustomObject(
      { group: POLICY_GROUP, version: POLICY_VERSION, plural: POLICY_PLURAL, name },
      this.urlOptions(url),
    );
  }

  private async list<T>(workspacePath: string, gvr: Gvr): Promise<T[]> {
    const result = (await this.kcpK8s.getKcpK8sCustomObjectsApi().listClusterCustomObject(
      { group: gvr.group, version: gvr.version, plural: gvr.plural },
      this.urlOptions(this.collectionUrl(workspacePath, gvr)),
    )) as K8sList<T>;
    return result?.items ?? [];
  }

  private collectionUrl(workspacePath: string, gvr: Gvr): string {
    const kcpUrl = this.kcpK8s.getKcpWorkspaceUrl(undefined, undefined, workspacePath);
    return `${kcpUrl}/apis/${gvr.group}/${gvr.version}/${gvr.plural}`;
  }

  private urlOptions(url: string, contentType?: string) {
    return {
      middleware: [
        new PromiseMiddlewareWrapper({
          pre: async (context) => {
            context.setUrl(url);
            if (contentType) context.setHeaderParam('Content-Type', contentType);
            return context;
          },
          post: async (context) => context,
        }),
      ],
    };
  }
}
