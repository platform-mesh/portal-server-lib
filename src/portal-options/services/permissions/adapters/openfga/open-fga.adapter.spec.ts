import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { OpenFgaAdapter } from './open-fga.adapter.js';
import { AuthorizationRequest } from './permissions.model.js';

function makeHttpService(
  postResult: unknown = {},
  getResult: unknown = {},
): jest.Mocked<HttpService> {
  return {
    post: jest.fn().mockReturnValue(of({ data: postResult })),
    get: jest.fn().mockReturnValue(of({ data: getResult })),
  } as unknown as jest.Mocked<HttpService>;
}

const BASE_REQ: AuthorizationRequest = {
  token: 'tok',
  userId: 'user-1',
  accountPath: 'root:orgs:org1',
  checks: [{ resource: 'accounts', actions: ['get', 'list'] }],
};

describe('OpenFgaAdapter', () => {
  let http: jest.Mocked<HttpService>;
  let adapter: OpenFgaAdapter;

  beforeEach(() => {
    http = makeHttpService({ result: {} });
    adapter = new OpenFgaAdapter(http, 'http://fga.local', 'store-1', 'model-1');
  });

  it('returns empty permissions when all checks are denied', async () => {
    const result = await adapter.checkPermissions(BASE_REQ);
    expect(result.permissions).toEqual([]);
  });

  it('maps allowed results to permission list', async () => {
    http.post.mockReturnValue(
      of({
        data: {
          result: {
            'accounts#get': { allowed: true, correlation_id: 'accounts#get' },
            'accounts#list': { allowed: false, correlation_id: 'accounts#list' },
          },
        },
      }) as any,
    );

    const result = await adapter.checkPermissions(BASE_REQ);
    expect(result.permissions).toEqual([{ resource: 'accounts', actions: ['get'] }]);
  });

  it('uses accountPath as object in tuple key', async () => {
    await adapter.checkPermissions(BASE_REQ);
    expect(http.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        checks: expect.arrayContaining([
          expect.objectContaining({
            tuple_key: expect.objectContaining({
              object: `accounts:${BASE_REQ.accountPath}`,
            }),
          }),
        ]),
      }),
    );
  });

  it('includes authorization_model_id in batch-check request body', async () => {
    await adapter.checkPermissions(BASE_REQ);
    expect(http.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ authorization_model_id: 'model-1' }),
    );
  });

  it('omits authorization_model_id when not configured', async () => {
    const adapterNoModel = new OpenFgaAdapter(http, 'http://fga.local', 'store-1', '');
    await adapterNoModel.checkPermissions(BASE_REQ);
    const body = (http.post.mock.calls[0] as any)[1];
    expect(body).not.toHaveProperty('authorization_model_id');
  });

  it('returns empty permissions on HTTP error', async () => {
    http.post.mockReturnValue(throwError(() => new Error('network error')) as any);
    const result = await adapter.checkPermissions(BASE_REQ);
    expect(result.permissions).toEqual([]);
  });

  it('returns empty when checks array is empty', async () => {
    const result = await adapter.checkPermissions({ ...BASE_REQ, checks: [] });
    expect(result.permissions).toEqual([]);
  });

  describe('when actions is "All"', () => {
    it('discovers relations from auth model and builds tuples', async () => {
      http.get.mockReturnValue(
        of({
          data: {
            authorization_models: [
              {
                type_definitions: [
                  {
                    type: 'accounts',
                    relations: { get: {}, create: {} },
                  },
                ],
              },
            ],
          },
        }) as any,
      );
      http.post.mockReturnValue(
        of({
          data: {
            result: {
              'accounts#get': { allowed: true, correlation_id: 'accounts#get' },
              'accounts#create': { allowed: true, correlation_id: 'accounts#create' },
            },
          },
        }) as any,
      );

      const result = await adapter.checkPermissions({
        ...BASE_REQ,
        checks: [{ resource: 'accounts', actions: 'All' }],
      });

      expect(result.permissions).toEqual([
        { resource: 'accounts', actions: ['get', 'create'] },
      ]);
    });

    it('returns empty relations when auth model fetch fails', async () => {
      http.get.mockReturnValue(throwError(() => new Error('not found')) as any);
      http.post.mockReturnValue(of({ data: { result: {} } }) as any);

      const result = await adapter.checkPermissions({
        ...BASE_REQ,
        checks: [{ resource: 'accounts', actions: 'All' }],
      });
      expect(result.permissions).toEqual([]);
    });
  });
});
