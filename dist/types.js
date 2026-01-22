"use strict";
/**
 * Type definitions for the Docker Registry Cleanup Action
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = exports.AuthenticationError = exports.RegistryError = void 0;
/**
 * Error types
 */
class RegistryError extends Error {
    statusCode;
    registryType;
    constructor(message, statusCode, registryType) {
        super(message);
        this.statusCode = statusCode;
        this.registryType = registryType;
        this.name = 'RegistryError';
    }
}
exports.RegistryError = RegistryError;
class AuthenticationError extends RegistryError {
    constructor(message, registryType) {
        super(message, 401, registryType);
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class NotFoundError extends RegistryError {
    constructor(message, registryType) {
        super(message, 404, registryType);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
//# sourceMappingURL=types.js.map