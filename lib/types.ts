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

/** A category (folder) that can contain sub-categories and saved requests. */
export interface Category {
  id: string;
  name: string;
  /** null means root-level category */
  parentId: string | null;
  /** Default headers applied to all requests inside this category (and children) */
  defaultHeaders: KeyValuePair[];
  /** Default query params applied to all requests inside this category (and children) */
  defaultParams: KeyValuePair[];
  description?: string;
  createdAt: number;
}

export interface SavedRequest {
  id: string;
  name: string;
  /** null means root-level (no category) */
  categoryId: string | null;
  request: RequestState;
  createdAt: number;
}

/** What is currently selected in the left pane */
export type Selection =
  | { type: 'request'; id: string }
  | { type: 'category'; id: string }
  | null;
