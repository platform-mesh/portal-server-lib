export interface K8sResourceDescriptor {
  group: string;
  version: string;
  plural: string;
  name?: string;
  namespace?: string;
  labelSelector?: string;
}

export interface K8sRequestContext extends Record<string, any> {
  organization: string;
  'core_platform-mesh_io_account'?: string;
}

export interface AccountInfo {
  spec: {
    oidc?: {
      issuerUrl: string;
      clients: {
        [key: string]: {
          clientId: string;
        };
      };
    };
  };
}
