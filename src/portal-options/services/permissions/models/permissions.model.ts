export interface AuthorizationRequest {
  token: string;
  organization: string;
  accountPath: string;
  checks: {
    resource: string;
    apiGroup: string;
    entityCollection: string;
    version: string;
    scope?: string;
    namespace?: string | null;
    name?: string;
    actions: string[];
  }[];
}

export interface Permission {
  resource: string;
  namespace?: string;
  name?: string;
  actions: string[];
}

export interface AuthorizationResponse {
  accountPath: string;
  permissions: Permission[];
}

// Used by both proxy calls — maps one verb to one batch item
export interface BatchAuthzItem {
  id: string;
  user: string;
  clusterPath: string; // full KCP path e.g. "root:orgs:sub:a1"
  resourceAttributes: {
    verb: string;
    group: string;
    version: string;
    resource: string; // entityCollection (plural), lowercase
    namespace?: string | null;
    name?: string | null;
  };
}

export interface IAuthzService {
  checkActionsForResource(req: AuthorizationRequest): Promise<Permission[] | undefined>;
  checkActionsForInstance(
    req: AuthorizationRequest,
  ): Promise<Permission[] | undefined>;
}
