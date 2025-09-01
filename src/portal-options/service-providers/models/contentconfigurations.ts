export interface ContentConfigurationQueryResponse {
  ui_platform_mesh_io: ContentConfigurationsResponse;
}

export interface ContentConfigurationsResponse {
    ContentConfigurations: ContentConfigurationResponse[];
}

export interface ContentConfigurationResponse {
    metadata: { name: string; labels?: Record<string, string>; };
    spec: { remoteConfiguration?: { url?: string; }; };
    status: { configurationResult?: string; };
}