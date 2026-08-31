import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTH_CONFIG_INJECTION_TOKEN,
  AuthConfigService,
  CookiesService,
  LogoutCallback,
} from '@openmfp/portal-server-lib';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PMLogoutService implements LogoutCallback {
  private logger: Logger = new Logger(PMLogoutService.name);

  constructor(
    @Inject(AUTH_CONFIG_INJECTION_TOKEN)
    private authConfigService: AuthConfigService,
    private httpService: HttpService,
    private cookiesService: CookiesService,
  ) {}

  public async handleLogout(
    request: Request,
    response: Response,
  ): Promise<void | string> {
    const authConfig = await this.authConfigService.getAuthConfig(request);
    try {
      const refreshToken = this.cookiesService.getAuthCookie(request);

      const body = new URLSearchParams({
        refresh_token: refreshToken,
      });

      // Client credentials go in the Authorization header, not the form body:
      // the client is registered with token_endpoint_auth_method
      // client_secret_basic, and an IdP that enforces it rejects credentials
      // sent as form parameters with unauthorized_client.
      await firstValueFrom(
        this.httpService.post(authConfig.endSessionUrl, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: {
            username: authConfig.clientId,
            password: authConfig.clientSecret,
          },
        }),
      );
    } catch (error: any) {
      this.logger.error(
        'Error during keycloak logout',
        error?.response?.data || error.message,
      );
      this.logger.warn('Trying to log out with the id token');
      return this.logoutWithIdToken(
        request,
        authConfig.endSessionUrl,
        authConfig.clientId,
      );
    }
  }

  private logoutWithIdToken(
    request: Request,
    endSessionUrl: string,
    clientId: string,
  ) {
    const { id_token_hint, post_logout_redirect_uri } = request.query;
    const params = new URLSearchParams();

    // RP-initiated logout honours post_logout_redirect_uri only together with
    // id_token_hint or client_id. An empty id_token_hint is not a no-op: the
    // IdP rejects the request ("Missing parameters: id_token_hint") and the
    // user is stranded on an error page instead of being signed out.
    if (id_token_hint) {
      params.set('id_token_hint', String(id_token_hint));
    } else {
      params.set('client_id', clientId);
    }

    if (post_logout_redirect_uri) {
      params.set('post_logout_redirect_uri', String(post_logout_redirect_uri));
    }

    return `${endSessionUrl}?${params}`;
  }
}
