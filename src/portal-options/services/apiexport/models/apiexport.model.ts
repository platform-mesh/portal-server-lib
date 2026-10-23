export interface ApiExportSpec {
  permissionClaims?: PermissionClaim[];
}

export interface PermissionClaim {
  group?: string;
  resource: string;
  all?: boolean;
}

export interface ApiExportStatus {
  identityHash?: string;
  conditions?: Condition[];
}

export interface Condition {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

export interface ApiExport {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec?: ApiExportSpec;
  status?: ApiExportStatus;
  enabled?: boolean;
}

export interface ApiExportPolicySpec {
  apiExportRef: { name: string };
}

export interface ApiExportPolicy {
  apiVersion: string;
  kind: string;
  metadata: { name: string };
  spec: ApiExportPolicySpec;
}

export interface ApiExportListResponse {
  items: ApiExport[];
}
