import { ServiceProviderResponse } from '@openmfp/portal-server-lib';

export const welcomeNodeConfig: ServiceProviderResponse = {
  rawServiceProviders: [
    {
      name: 'openmfp-system',
      displayName: '',
      creationTimestamp: '',
      contentConfiguration: [
        {
          name: 'openmfp-system',
          creationTimestamp: '',
          luigiConfigFragment: {
            data: {
              nodes: [
                {
                  entityType: 'global',
                  pathSegment: 'welcome',
                  hideFromNav: true,
                  hideSideNav: true,
                  order: 1,
                  url: '/assets/platform-mesh-portal-ui-wc.js#welcome-view',
                  webcomponent: {
                    selfRegistered: true,
                  },
                  context: { kcpPath: 'root:orgs' },
                },
              ],
            },
          },
        },
      ],
    },
  ],
};
