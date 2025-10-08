import type { Request } from 'express';

export const getDomainAndOrganization = (
  request: Request,
): { organization?: string; baseDomain?: string } => {
  const subDomain = request.hostname.split('.')[0];
  const clientId = process.env['OIDC_CLIENT_ID_DEFAULT'];
  const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
  return {
    organization: request.hostname === baseDomain ? clientId : subDomain,
    baseDomain,
  };
};
