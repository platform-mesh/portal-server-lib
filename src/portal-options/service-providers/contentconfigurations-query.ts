import { gql } from 'graphql-request';

export const contentConfigurationsQuery = gql`
  query {
    ui_platform_mesh_io {
      ContentConfigurations {
        metadata {
          name
          labels
        }
        spec {
          remoteConfiguration {
            url
          }
        }
        status {
          configurationResult
        }
      }
    }
  }
`;
