import { RequestContextProviderImpl } from '../openmfp-request-context-provider.js';
import { MUTATION_LOGIN } from './queries.js';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { GraphQLClient } from 'graphql-request';

@Injectable()
export class IAMGraphQlService {
  constructor(private requestContextProvider: RequestContextProviderImpl) {}

  async addUser(token: string, request: Request): Promise<void> {
    const requestContext =
      await this.requestContextProvider.getContextValues(request);
    const iamUrl = requestContext.iamServiceApiUrl;
    const client = new GraphQLClient(iamUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    try {
      await client.request(MUTATION_LOGIN);
    } catch (e) {
      console.error(e);
    }
  }
}
