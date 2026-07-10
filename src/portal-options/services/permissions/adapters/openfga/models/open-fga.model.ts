export interface BatchCheckTuple {
  tuple_key: {
    user: string;
    relation: string;
    object: string;
  };
  correlation_id: string;
}

export interface BatchCheckResult {
  allowed: boolean;
  correlation_id: string;
}

export interface BatchCheckResponse {
  result: Record<string, BatchCheckResult>;
}

export interface AuthModelList {
  authorization_models: {
    type_definitions: {
      type: string;
      relations: Record<string, unknown>;
    }[];
  }[];
}
