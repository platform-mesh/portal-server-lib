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
        'Error during keycloak logout',
        error?.response?.data || error.message,
      );
      this.logger.warn('Trying to log out with the id token');
      return this.logoutWithIdToken(request, authConfig.endSessionUrl);
    }
  }

  private logoutWithIdToken(request: Request, endSessionUrl: string) {
    const { id_token_hint, post_logout_redirect_uri } = request.query;
    const params = new URLSearchParams({
      id_token_hint: String(id_token_hint),
      post_logout_redirect_uri: String(post_logout_redirect_uri),
    });
    return `${endSessionUrl}?${params}`;
  }
}
