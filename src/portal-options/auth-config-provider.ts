import { CoreV1Api, KubeConfig } from '@kubernetes/client-node';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  AuthConfigService,
  DiscoveryService,
  ServerAuthVariables,
} from '@openmfp/portal-server-lib';
import type { Request } from 'express';

@Injectable()
export class PMAuthConfigProvider implements AuthConfigService {
  private k8sApi: CoreV1Api;

  constructor(private discoveryService: DiscoveryService) {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
  }

  async getAuthConfig(request: Request): Promise<ServerAuthVariables> {
    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];

    const subDomain = request.hostname.split('.')[0];
    const isSubdomain = request.hostname !== baseDomain;

    const clientId = isSubdomain
      ? subDomain
      : process.env['OIDC_CLIENT_ID_DEFAULT'];
    const clientSecret = await this.getClientSecret(clientId);

    const oidcUrl = process.env[`DISCOVERY_ENDPOINT`]?.replace(
      '${org-name}',
      clientId,
    );
    const oidc = await this.discoveryService.getOIDC(oidcUrl);
    const oauthServerUrl =
      oidc?.authorization_endpoint ?? process.env['AUTH_SERVER_URL_DEFAULT'];
    const oauthTokenUrl =
      oidc?.token_endpoint ?? process.env['TOKEN_URL_DEFAULT'];

    if (!oauthServerUrl || !oauthTokenUrl || !clientId || !clientSecret) {
      const hasClientSecret = !!clientSecret;
      throw new HttpException(
        {
          message: 'Default auth configuration incomplete.',
          error: `The default properly configured. oauthServerUrl: '${oauthServerUrl}' oauthTokenUrl: '${oauthTokenUrl}' clientId: '${clientId}', has client secret: ${String(
            hasClientSecret,
          )}`,
          statusCode: HttpStatus.NOT_FOUND,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      idpName: clientId,
      baseDomain,
      clientId,
      clientSecret,
      oauthServerUrl,
      oauthTokenUrl,
      // @ts-ignore
      oidcIssuerUrl: oidc.issuer,
    };
  }

  private async getClientSecret(orgName: string) {
    const secretName = `portal-client-secret-${orgName}`;
    const namespace = 'platform-mesh-system';

    try {
      const res = await this.k8sApi.readNamespacedSecret({
        namespace,
        name: secretName,
      });
      const secretData = res.data;

      const clientSecret = Buffer.from(
        secretData['attribute.client_secret'],
        'base64',
      ).toString('utf-8');
      return clientSecret;
    } catch (err) {
      console.error(
        `Failed to fetch secret ${secretName}:`,
        err.response?.body || err,
      );
      throw err;
    }
  }
}
