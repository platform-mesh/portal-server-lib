import { K8sResourceDescriptor } from '../../models/k8s.js';

export const GVR_APIEXPORT: K8sResourceDescriptor = {
  group: 'apis.kcp.io',
  version: 'v1alpha1',
  plural: 'apiexports',
};

export const GVR_POLICY: K8sResourceDescriptor = {
  group: 'core.platform-mesh.io',
  version: 'v1alpha1',
  plural: 'apiexportpolicies',
};

export const GVR_WORKSPACE: K8sResourceDescriptor = {
  group: 'tenancy.kcp.io',
  version: 'v1alpha1',
  plural: 'workspaces',
};

export const WORKSPACE_PROVIDERS = 'root:providers';
export const WORKSPACE_POLICY_HOME = 'root:orgs';
