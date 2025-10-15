import type { Request } from 'express';

export const getOrganization = (request: Request): string => {
  const subDomain = request.hostname.split('.')[0];
  const clientId = process.env['OIDC_CLIENT_ID_DEFAULT'];
  const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
  return request.hostname !== baseDomain ? subDomain : clientId;
};


export const getDiscoveryEndpoint = (request: Request): string => {
  const clientId = getOrganization(request);
  return process.env[`DISCOVERY_ENDPOINT`]?.replace(
      '${org-name}',
      clientId,
  );
}
