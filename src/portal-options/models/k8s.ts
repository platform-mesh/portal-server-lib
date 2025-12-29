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

export interface IdentityProviderConfiguration {
  status: {
    managedClients: {
      [key: string]: {
        clientId: string;
        secretRef?: {
          name: string;
          namespace: string;
        };
      };
    };
  };
}
