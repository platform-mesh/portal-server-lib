export interface AuthorizationRequest {
  token: string;
  organization: string;
  accountPath: string;
  checks: { resource: string; apiGroup: string; actions: string[] | 'All' }[];
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface AuthorizationResponse {
  accountPath: string;
  permissions: Permission[];
}

export interface IPermissionsAdapter {
  checkPermissions(req: AuthorizationRequest): Promise<AuthorizationResponse>;
}
