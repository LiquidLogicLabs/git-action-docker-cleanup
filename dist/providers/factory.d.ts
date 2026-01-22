import { IRegistryProvider, ProviderConfig } from '../types';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * Create provider instance based on registry type
 */
export declare function createProvider(logger: Logger, config: ProviderConfig, httpClient: HttpClient): IRegistryProvider;
//# sourceMappingURL=factory.d.ts.map