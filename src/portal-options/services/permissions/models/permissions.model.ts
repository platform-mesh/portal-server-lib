export interface PermissionsDefinition {
  group: string;
  resource: string;
  entityActions: string[];
  resourceActions: string[];
  entityContextKey: string;
}

export interface AuthorizationRequest {
  token: string;
  organization: string;
  accountPath: string;
  checks: {
    resource: string;
    group: string;
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

export interface SubjectAccessReview {
  apiVersion?: string;
  kind?: string;
  metadata: { name: string };
  spec: {
    user: string;
    extra: Record<string, string[]>; // cluster path lives under the cluster-path key
    resourceAttributes: {
      verb: string;
      group: string;
      resource: string; // plural resource name, lowercase
      namespace?: string | null;
      name?: string | null;
    };
  };
}

export interface IAuthzService {
  checkActionsForResource(req: AuthorizationRequest): Promise<Permission[] | undefined>;
  checkActionsForInstance(
    req: AuthorizationRequest,
  ): Promise<Permission[] | undefined>;
}
