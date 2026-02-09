import { ProviderConfig, CleanupConfig } from './types';
import { Logger } from './logger';
export type ParsedInputs = {
    providerConfig: ProviderConfig;
    cleanupConfig: CleanupConfig;
    packages: string[];
    skipCertificateCheck: boolean;
    logger: Logger;
};
export declare function getInputs(): ParsedInputs;
