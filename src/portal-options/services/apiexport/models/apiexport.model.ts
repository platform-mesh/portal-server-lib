// API response/request shapes

export interface AllowRule {
  path: string;
  includeDescendants: boolean;
}

export interface ApiExportAdminItem {
  metadata: {
    name: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  clusterPath: string;
  allowRules: AllowRule[];
}

export interface ApiExportListResponse {
  items: ApiExportAdminItem[];
}

export interface SetApiExportPolicyRequest {
  clusterPath: string;
  allowRules: AllowRule[];
}

// Internal CRD types — match security-operator api/v1alpha1/apiexportpolicy_types.go exactly

export interface ApiExportRef {
  name: string;
  clusterPath: string;
}

export interface ApiExportPolicySpec {
  apiExportRef: ApiExportRef;
  allowPathExpressions: string[];
}

export interface ApiExportPolicyStatus {
  conditions?: Array<{
    type: string;
    status: string;
    lastTransitionTime?: string;
    reason?: string;
    message?: string;
  }>;
  managedAllowExpressions?: string[];
}

export interface ApiExportPolicyCRD {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    resourceVersion?: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec: ApiExportPolicySpec;
  status?: ApiExportPolicyStatus;
}

// KCP APIExport CRD types (apis.kcp.io/v1alpha1)

export interface ApiExportCRD {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec?: {
    permissionClaims?: Array<{
      group?: string;
      resource: string;
      all?: boolean;
    }>;
  };
}

// KCP Workspace types (tenancy.kcp.io/v1alpha1)

export interface KcpWorkspace {
  metadata: {
    name: string;
  };
}
