import { ProviderConfig, CleanupConfig } from './types';
export type ParsedInputs = {
    providerConfig: ProviderConfig;
    cleanupConfig: CleanupConfig;
    packages: string[];
    skipCertificateCheck: boolean;
};
export declare function getInputs(): ParsedInputs;
