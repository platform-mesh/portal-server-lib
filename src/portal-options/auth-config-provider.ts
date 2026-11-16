import {
  IdentityProviderConfiguration,
  K8sResourceDescriptor,
} from './models/k8s.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getDiscoveryEndpoint, getOrganization } from './utils/domain.js';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  AuthConfigService,
  DiscoveryService,
  ServerAuthVariables,
} from '@openmfp/portal-server-lib';
import type { Request } from 'express';

@Injectable()
export class PMAuthConfigProvider implements AuthConfigService {
  constructor(
    private discoveryService: DiscoveryService,
    private kcpKubernetesService: KcpKubernetesService,
  ) {}

  async getAuthConfig(request: Request): Promise<ServerAuthVariables> {
    const oidcUrl = getDiscoveryEndpoint(request);
    const org = getOrganization(request);

    const { clientId, clientSecret } = await this.readClient(org);

    const baseDomain = process.env['BASE_DOMAINS_DEFAULT'];
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
      idpName: org,
      baseDomain,
      clientId,
      clientSecret,
      oauthServerUrl,
      oauthTokenUrl,
      oidcIssuerUrl: oidc?.issuer,
      endSessionUrl: oidc?.end_session_endpoint,
    };
  }

  // A static client serves every organization: identity providers other than
  // Keycloak have no IdentityProviderConfiguration to read a client from.
  private async readClient(
    orgName: string,
  ): Promise<{ clientId: string; clientSecret: string }> {
    const staticClientId = process.env['OIDC_STATIC_CLIENT_ID'];
    if (staticClientId) {
      return {
        clientId: staticClientId,
        clientSecret: process.env['OIDC_STATIC_CLIENT_SECRET'],
      };
    }

    const { clientId, secretRefName } = await this.readClientId(orgName);
    const clientSecret =
      await this.kcpKubernetesService.getClientSecret(secretRefName);
    return { clientId, clientSecret };
  }

  private async readClientId(
    orgName: string,
  ): Promise<{ clientId: string; secretRefName: string }> {
    const k8sResourceDescriptor: K8sResourceDescriptor = {
      group: 'core.platform-mesh.io',
      version: 'v1alpha1',
      plural: 'identityproviderconfigurations',
      name: orgName,
    };

    // IDP resources for 'welcome' are in root:platform-mesh-system,
    // for regular orgs they are in root:orgs
    const workspacePath =
      orgName === 'welcome' ? 'root:platform-mesh-system' : 'root:orgs';

    const result: IdentityProviderConfiguration =
      await this.kcpKubernetesService.listClusterCustomObject(
        k8sResourceDescriptor,
        {
          organization: orgName,
        },
        workspacePath,
      );

    return {
      clientId: result.status.managedClients[orgName].clientId,
      secretRefName: result.status.managedClients[orgName].secretRef.name,
    };
  }
}
