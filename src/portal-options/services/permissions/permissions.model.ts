export interface AuthorizationRequest {
  userId: string;
  accountPath: string;
  checks: { resource: string; actions: string[] | 'All' }[];
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface AuthorizationResponse {
  userId: string;
  accountPath: string;
  permissions: Permission[];
}

export interface IPermissionsAdapter {
  checkPermissions(req: AuthorizationRequest): Promise<AuthorizationResponse>;
}
