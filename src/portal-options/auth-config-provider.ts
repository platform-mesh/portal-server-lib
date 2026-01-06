import {
  IdentityProviderConfiguration,
  K8sResourceDescriptor,
} from './models/k8s.js';
import { KcpKubernetesService } from './services/kcp-k8s.service.js';
import { getDiscoveryEndpoint, getOrganization } from './utils/domain.js';
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
  constructor(
    private discoveryService: DiscoveryService,
    private kcpKubernetesService: KcpKubernetesService,
  ) {}

  async getAuthConfig(request: Request): Promise<ServerAuthVariables> {
    const oidcUrl = getDiscoveryEndpoint(request);
    const org = getOrganization(request);

    const clientId =
      org === 'welcome' ? 'welcome' : await this.readClientId(org);
    const clientSecret =
      org === 'welcome'
        ? await this.getWelcomeClientSecret(org)
        : await this.kcpKubernetesService.getClientSecret(org);

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
      idpName: clientId,
      baseDomain,
      clientId,
      clientSecret,
      oauthServerUrl,
      oauthTokenUrl,
      oidcIssuerUrl: oidc?.issuer,
      endSessionUrl: oidc?.end_session_endpoint,
    };
  }

  private async readClientId(orgName: string): Promise<string> {
    const k8sResourceDescriptor: K8sResourceDescriptor = {
      group: 'core.platform-mesh.io',
      version: 'v1alpha1',
      plural: 'identityproviderconfigurations',
      name: orgName,
    };

    const result: IdentityProviderConfiguration =
      await this.kcpKubernetesService.listClusterCustomObject(
        k8sResourceDescriptor,
        {
          organization: orgName,
        },
      );
    return result.status.managedClients[orgName].clientId;
  }

  private async getWelcomeClientSecret(orgName: string) {
    const secretName = `portal-client-secret-${orgName}`;
    const namespace = 'platform-mesh-system';

    const kc = new KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(CoreV1Api);
    try {
      const res = await k8sApi.readNamespacedSecret({
        namespace,
        name: secretName,
      });
      const secretData = res.data;

      return Buffer.from(
        secretData['attribute.client_secret'],
        'base64',
      ).toString('utf-8');
    } catch (err) {
      console.error(
        `Failed to fetch secret ${secretName}:`,
        err.response?.body || err,
      );
      throw err;
    }
  }
}
