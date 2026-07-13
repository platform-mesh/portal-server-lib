export interface FgaTupleKey {
  user: string;
  relation: string;
  object: string;
}

export interface BatchCheckTuple {
  tuple_key: FgaTupleKey;
  correlation_id: string;
  contextual_tuples?: { tuple_keys: FgaTupleKey[] };
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
