/**
 * JSON-RPC Codec 单元测试
 */
import { describe, it, expect } from 'vitest';
import { JSONRPCCodec, JSONRPC_ERROR_CODES } from '@mcp/protocol/json-rpc';

describe('JSONRPCCodec', () => {
  const codec = new JSONRPCCodec();

  describe('createRequest', () => {
    it('should create a valid request', () => {
      const req = codec.createRequest('tools/list', { filter: 'harmony' });
      expect(req.jsonrpc).toBe('2.0');
      expect(req.method).toBe('tools/list');
      expect(req.params).toEqual({ filter: 'harmony' });
      expect(req.id).toBeDefined();
    });

    it('should accept custom id', () => {
      const req = codec.createRequest('test', {}, 'custom-id');
      expect(req.id).toBe('custom-id');
    });

    it('should generate unique ids', () => {
      const req1 = codec.createRequest('a', {});
      const req2 = codec.createRequest('b', {});
      expect(req1.id).not.toBe(req2.id);
    });
  });

  describe('createNotification', () => {
    it('should create notification without id', () => {
      const notif = codec.createNotification('notifications/initialized', {});
      expect(notif.jsonrpc).toBe('2.0');
      expect(notif.id).toBeUndefined();
    });
  });

  describe('createResponse', () => {
    it('should create a success response', () => {
      const res = codec.createResponse('req-1', { tools: [] });
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe('req-1');
      expect(res.result).toEqual({ tools: [] });
      expect(res.error).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const res = codec.createErrorResponse(
        'req-1',
        JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
        'Method not found'
      );
      expect(res.error).toBeDefined();
      expect(res.error!.code).toBe(JSONRPC_ERROR_CODES.METHOD_NOT_FOUND);
      expect(res.result).toBeUndefined();
    });

    it('should include error data', () => {
      const res = codec.createErrorResponse('req-1', -1, 'Custom error', {
        detail: 'extra info',
      });
      expect(res.error!.data).toEqual({ detail: 'extra info' });
    });
  });

  describe('validate', () => {
    it('should accept valid request', () => {
      const result = codec.validate({
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
        params: {},
      });
      expect(result.valid).toBe(true);
    });

    it('should accept valid notification (no id)', () => {
      const result = codec.validate({
        jsonrpc: '2.0',
        method: 'test',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid jsonrpc version', () => {
      const result = codec.validate({
        jsonrpc: '1.0',
        method: 'test',
        id: '1',
      });
      expect(result.valid).toBe(false);
    });

    it('should reject missing method', () => {
      const result = codec.validate({
        jsonrpc: '2.0',
        id: '1',
      });
      expect(result.valid).toBe(false);
    });

    it('should accept valid response', () => {
      const result = codec.validate({
        jsonrpc: '2.0',
        id: '1',
        result: {},
      });
      expect(result.valid).toBe(true);
    });

    it('should accept valid error response', () => {
      const result = codec.validate({
        jsonrpc: '2.0',
        id: '1',
        error: { code: -1, message: 'err' },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject object with neither result nor error', () => {
      const result = codec.validate({
        jsonrpc: '2.0',
        id: '1',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('encode/decode', () => {
    it('should encode to JSON', () => {
      const req = codec.createRequest('test', { a: 1 }, 'id-1');
      const json = codec.encode(req);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe('id-1');
    });

    it('should decode single message', () => {
      const req = codec.createRequest('test', {});
      const json = codec.encode(req);
      const decoded = codec.decode(json);
      expect(decoded.error).toBeUndefined();
      expect(decoded.message).toBeDefined();
      expect((decoded.message as any).method).toBe('test');
    });

    it('should decode batch', () => {
      const msg1 = codec.createRequest('a', {}, '1');
      const msg2 = codec.createRequest('b', {}, '2');
      const batch = codec.encode([msg1, msg2]);
      const decoded = codec.decodeBatch(batch);
      expect(decoded).toHaveLength(2);
    });

    it('should return error for invalid JSON', () => {
      const result = codec.decode('not json');
      expect(result.error).toBeDefined();
    });
  });

  describe('error codes', () => {
    it('should define standard JSON-RPC errors', () => {
      expect(JSONRPC_ERROR_CODES.PARSE_ERROR).toBe(-32700);
      expect(JSONRPC_ERROR_CODES.INVALID_REQUEST).toBe(-32600);
      expect(JSONRPC_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32601);
      expect(JSONRPC_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
      expect(JSONRPC_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    });
  });
});
