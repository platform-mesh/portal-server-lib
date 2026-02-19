export interface ContentConfigurationQueryResponse {
  ui_platform_mesh_io: { v1alpha1: ContentConfigurationsResponse };
}

export interface ContentConfigurationsResponse {
  ContentConfigurations: { items: ContentConfigurationResponse[] };
}

export interface ContentConfigurationResponse {
    metadata: { name: string; labels?: Record<string, string>; };
    spec: { remoteConfiguration?: { url?: string; }; };
    status: { configurationResult?: string; };
}
