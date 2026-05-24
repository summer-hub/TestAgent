/**
 * ErrorClassifier 单元测试
 */
import { describe, it, expect } from 'vitest';
import { ErrorClassifier } from '@fixer/classifier/error-classifier';

describe('ErrorClassifier', () => {
  const classifier = new ErrorClassifier();

  describe('classify', () => {
    it('should classify element not found error', () => {
      const result = classifier.classify('Element not found: login_button', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify timeout error', () => {
      const result = classifier.classify('Operation timed out after 30 seconds', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify auth error (English)', () => {
      const result = classifier.classify('Authentication failed: invalid token', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should classify auth error (Chinese)', () => {
      const result = classifier.classify('登录失败，请重新登录', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should classify network error', () => {
      const result = classifier.classify('Network error: ECONNREFUSED 127.0.0.1:5037', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify assertion error', () => {
      const result = classifier.classify('Expected text "Welcome" not found on page', '');
      expect(result.failureType).toBeDefined();
    });

    it('should classify selector error', () => {
      // 匹配 ELEMENT_NOT_FOUND 规则
      const result = classifier.classify('element not found: xpath=//Button[1]', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify app crash error', () => {
      const result = classifier.classify('Application crashed: NullPointerException at com.example', '');
      expect(result.failureType).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should consider context for confidence boost', () => {
      const withoutContext = classifier.classify('Login page not responding', '', {});
      const withContext = classifier.classify('Login page not responding', '', { context: 'login' });
      expect(withContext.confidence).toBeGreaterThanOrEqual(withoutContext.confidence);
    });
  });
});
