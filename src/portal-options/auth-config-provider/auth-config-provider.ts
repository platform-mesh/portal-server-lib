import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  AuthConfigService,
  DiscoveryService,
  EnvAuthConfigService,
  ServerAuthVariables,
} from '@openmfp/portal-server-lib';
import type { Request } from 'express';

@Injectable()
export class PMAuthConfigProvider implements AuthConfigService {
  constructor(
    private discoveryService: DiscoveryService,
    private envEuthConfigService: EnvAuthConfigService,
  ) {}

  async getAuthConfig(request: Request): Promise<ServerAuthVariables> {
    try {
      return await this.envEuthConfigService.getAuthConfig(request);
    } catch {
      console.log(
        'Failed to retrieve auth config from environment variables based on provided IDP.',
      );
    }

    console.log('Resolving auth config from default configuration.');

    const oidc = await this.discoveryService.getOIDC('DEFAULT');
    const oauthServerUrl =
      oidc?.authorization_endpoint ?? process.env['AUTH_SERVER_URL_DEFAULT'];
    const oauthTokenUrl =
      oidc?.token_endpoint ?? process.env['TOKEN_URL_DEFAULT'];

    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
    const clientId = process.env['OIDC_CLIENT_ID_DEFAULT'];
    const clientSecretEnvVar = 'OIDC_CLIENT_SECRET_DEFAULT';
    const clientSecret = process.env[clientSecretEnvVar];

    if (!oauthServerUrl || !oauthTokenUrl || !clientId || !clientSecret) {
      const hasClientSecret = !!clientSecret;
      throw new HttpException(
        {
          message: 'Default auth configuration incomplete.',
          error: `The default properly configured. oauthServerUrl: '${oauthServerUrl}' oauthTokenUrl: '${oauthTokenUrl}' clientId: '${clientId}', has client secret (${clientSecretEnvVar}): ${String(
            hasClientSecret,
          )}`,
          statusCode: HttpStatus.NOT_FOUND,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const subDomain = request.hostname.split('.')[0];
    return {
      idpName: request.hostname === baseDomain ? clientId : subDomain,
      baseDomain,
      oauthServerUrl,
      clientId,
      clientSecret,
      oauthTokenUrl,
    };
  }

  getDomain(request: Request): { organization?: string; baseDomain?: string } {
    const subDomain = request.hostname.split('.')[0];
    const clientId = process.env['OIDC_CLIENT_ID_DEFAULT'];
    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
    return {
      organization: request.hostname === baseDomain ? clientId : subDomain,
      baseDomain,
    };
  }
}
