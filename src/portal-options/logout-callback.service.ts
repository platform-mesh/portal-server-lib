import {HttpService} from "@nestjs/axios";
import {HttpException, Inject, Injectable, Logger} from '@nestjs/common';
import {
    AUTH_CONFIG_INJECTION_TOKEN, AuthConfigService, CookiesService,
    LogoutCallback,
} from '@openmfp/portal-server-lib';
import { Request, Response } from 'express';
import {firstValueFrom} from "rxjs";

@Injectable()
export class PMLogoutService implements LogoutCallback {
    private logger: Logger = new Logger(PMLogoutService.name);

    constructor(    @Inject(AUTH_CONFIG_INJECTION_TOKEN)
                    private authConfigService: AuthConfigService, private httpService: HttpService,
                    private cookiesService: CookiesService,
    ) {}

    public async handleLogout(request: Request, response: Response): Promise<void> {
        try {
            const refreshToken = this.cookiesService.getAuthCookie(request);
            const authConfig = await this.authConfigService.getAuthConfig(request);


            const body = new URLSearchParams({
                client_id: authConfig.clientId,
                refresh_token: refreshToken,
            });

            await firstValueFrom(
                this.httpService.post(authConfig.endSessionUrl, body, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                }),
            );


        } catch (error: any) {
            this.logger.error('Error during Keycloak logout', error?.response?.data || error.message);
            throw new HttpException(
                error?.response?.data || 'Logout failed',
                error?.response?.status || 500,
            );
        }
    }
}
