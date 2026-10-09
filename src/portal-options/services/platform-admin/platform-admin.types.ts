export interface ApiExportEntry { name: string; clusterPath: string; }
export interface OrgEntry { name: string; }
export interface ApiExportRef { name: string; clusterPath: string; }
export interface PolicyEntry {
  name: string;
  apiExportRef: ApiExportRef;
  allowPathExpressions: string[];
}
export interface CreatePolicyRequest {
  name: string;
  apiExportName: string;
  clusterPath: string;
  allowPathExpressions: string[];
}
export interface UpdatePolicyRequest { allowPathExpressions: string[]; }
