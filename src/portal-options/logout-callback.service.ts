import { HttpService } from '@nestjs/axios';
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
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

  private realmLogoutUrl =
    'https://portal.cc-d2.showroom.apeirora.eu/keycloak/realms/default/protocol/openid-connect/logout';

  constructor(
    @Inject(AUTH_CONFIG_INJECTION_TOKEN)
    private authConfigService: AuthConfigService,
    private httpService: HttpService,
    private cookiesService: CookiesService,
  ) {}

  public async handleLogout(
    request: Request,
    response: Response,
  ): Promise<void> {
    try {
      const refreshToken = this.cookiesService.getAuthCookie(request);
      const authConfig = await this.authConfigService.getAuthConfig(request);

      if (!refreshToken) {
        this.logger.warn(
          'No refresh token found — falling back to front-channel logout',
        );

        const idToken = request.headers['authorization']?.split(' ')[1];
        const postLogoutRedirect = `/login`;
        const idTokenHintParam = `id_token_hint=${encodeURIComponent(idToken)}`;
        const postLogoutRedirectUri = `post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirect)}`;
        const logoutRedirectUrl = `${this.realmLogoutUrl}?${idTokenHintParam}&${postLogoutRedirectUri}`;

        return response.redirect(logoutRedirectUrl);
      }

      const body = new URLSearchParams({
        client_id: authConfig.clientId,
        client_secret: authConfig.clientSecret,
        refresh_token: refreshToken,
      });

      await firstValueFrom(
        this.httpService.post(authConfig.endSessionUrl, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    } catch (error: any) {
      this.logger.error(
        'Error during Keycloak logout',
        error?.response?.data || error.message,
      );
      throw new HttpException(
        error?.response?.data || 'Logout failed',
        error?.response?.status || 500,
      );
    }
  }
}
