export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestState {
  method: HttpMethod;
  url: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  body: string;
  contentType: string;
}

export interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  responseTime: number;
  size: number;
  error?: string;
}

export interface HistoryItem {
  id: string;
  request: RequestState;
  response: ResponseState;
  timestamp: number;
}

export interface SavedRequest {
  id: string;
  name: string;
  request: RequestState;
  createdAt: number;
}
