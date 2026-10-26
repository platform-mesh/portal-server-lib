import { K8sResourceDescriptor } from '../../models/k8s.js';

export const APIEXPORT_GROUP = 'apis.kcp.io';
export const APIEXPORT_VERSION = 'v1alpha1';
export const APIEXPORT_PLURAL = 'apiexports';

export const POLICY_GROUP = 'core.platform-mesh.io';
export const POLICY_VERSION = 'v1alpha1';
export const POLICY_PLURAL = 'apiexportpolicies';

export const WORKSPACE_PROVIDERS = 'root:providers';

export const GVR_APIEXPORT: K8sResourceDescriptor = {
  group: APIEXPORT_GROUP,
  version: APIEXPORT_VERSION,
  plural: APIEXPORT_PLURAL,
};

export const GVR_POLICY: K8sResourceDescriptor = {
  group: POLICY_GROUP,
  version: POLICY_VERSION,
  plural: POLICY_PLURAL,
};

export const GVR_WORKSPACE: K8sResourceDescriptor = {
  group: 'tenancy.kcp.io',
  version: 'v1alpha1',
  plural: 'workspaces',
};
