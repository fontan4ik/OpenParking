export interface ServiceOptions {
  schedule?: string;
  service: string;
  leading?: boolean;
  type?: string;
}

export interface ServiceState<T = Record<string, never>> extends Readonly<ServiceOptions> {
  state: T;
}
