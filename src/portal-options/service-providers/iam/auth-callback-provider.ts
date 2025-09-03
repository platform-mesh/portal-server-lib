import { IAMGraphQlService } from './iam-graphql.service.js';
import { Injectable, Logger } from '@nestjs/common';
import { AuthCallback, AuthTokenData } from '@openmfp/portal-server-lib';
import { Request, Response } from 'express';

@Injectable()
export class AuthCallbackProvider implements AuthCallback {
  private logger: Logger = new Logger(AuthCallbackProvider.name);

  constructor(private iamService: IAMGraphQlService) {}

  async handleSuccess(
    request: Request,
    response: Response,
    authTokenResponse: AuthTokenData,
  ): Promise<void> {
    try {
      await this.iamService.addUser(authTokenResponse.id_token, request);
    } catch (e) {
      this.logger.error(e);
    }
  }

  async handleFailure(request: Request, response: Response): Promise<void> {
    return Promise.resolve();
  }
}
