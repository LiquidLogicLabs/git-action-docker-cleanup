import { Logger } from '../logger';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with verbose disabled', () => {
    const logger = new Logger(false);

    it('should log info messages', () => {
      logger.info('Test message');
      expect(core.info).toHaveBeenCalledWith('Test message');
    });

    it('should log warning messages', () => {
      logger.warning('Warning message');
      expect(core.warning).toHaveBeenCalledWith('Warning message');
    });

    it('should log error messages', () => {
      logger.error('Error message');
      expect(core.error).toHaveBeenCalledWith('Error message');
    });

    it('should log debug messages using core.debug() when verbose is false', () => {
      logger.debug('Debug message');
      expect(core.debug).toHaveBeenCalledWith('Debug message');
      expect(core.info).not.toHaveBeenCalled();
    });

    it('should expose verbose property', () => {
      expect(logger.verbose).toBe(false);
    });
  });

  describe('with verbose enabled', () => {
    const logger = new Logger(true);

    it('should log debug messages using core.info() with [DEBUG] prefix when verbose is true', () => {
      logger.debug('Debug message');
      expect(core.info).toHaveBeenCalledWith('[DEBUG] Debug message');
      expect(core.debug).not.toHaveBeenCalled();
    });

    it('should expose verbose property', () => {
      expect(logger.verbose).toBe(true);
    });
  });

  describe('default constructor', () => {
    it('should default to verbose=false', () => {
      const logger = new Logger();
      expect(logger.verbose).toBe(false);
      logger.debug('Test');
      expect(core.debug).toHaveBeenCalledWith('Test');
      expect(core.info).not.toHaveBeenCalled();
    });
  });
});
