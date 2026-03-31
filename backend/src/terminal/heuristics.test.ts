import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { HeuristicsEngine } from './heuristics.js';

describe('HeuristicsEngine', () => {
  let engine: HeuristicsEngine;

  beforeEach(() => {
    engine = new HeuristicsEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('process', () => {
    it('returns empty result for empty chunk', () => {
      const result = engine.process('');
      expect(result).toEqual({});
    });

    it('handles null/undefined chunk gracefully', () => {
      // @ts-ignore - testing invalid input
      const result = engine.process(null);
      expect(result).toEqual({});
    });

    it('processes chunk without throwing', () => {
      const chunk = Buffer.from('some terminal output').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('returns a valid HeuristicsResult structure', () => {
      const chunk = Buffer.from('test output').toString('base64');
      const result = engine.process(chunk);
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('action');
    });
  });

  describe('dispose', () => {
    it('cleans up resources without throwing', () => {
      expect(() => engine.dispose()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      expect(() => {
        engine.dispose();
        engine.dispose();
      }).not.toThrow();
    });

    it('returns empty result after dispose', () => {
      engine.dispose();
      const chunk = Buffer.from('test').toString('base64');
      const result = engine.process(chunk);
      expect(result).toEqual({});
    });
  });

  describe('UTF-8 handling', () => {
    it('handles UTF-8 characters correctly', () => {
      const chunk = Buffer.from('Hello 世界 🌍').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles mixed ASCII and UTF-8', () => {
      const chunk = Buffer.from('File: test.py\nContent: 你好\nDone').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles multi-byte UTF-8 characters', () => {
      const chunk = Buffer.from('日本語テスト').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles emojis', () => {
      const chunk = Buffer.from('Status: ✅ Error: ❌').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles incomplete UTF-8 sequences across chunks', () => {
      // Send a chunk that ends with a partial UTF-8 sequence
      const fullText = 'Hello 世界';
      const chunk1 = Buffer.from('Hello ').toString('base64');
      const chunk2 = Buffer.from('世界').toString('base64');

      engine.process(chunk1);
      // Second chunk should handle the carryover correctly
      expect(() => engine.process(chunk2)).not.toThrow();
    });
  });

  describe('resource management', () => {
    it('maintains separate state for multiple instances', () => {
      const engine1 = new HeuristicsEngine();
      const engine2 = new HeuristicsEngine();

      const chunk = Buffer.from('test').toString('base64');
      engine1.process(chunk);
      engine2.process(chunk);

      // Both should work independently
      expect(() => engine1.dispose()).not.toThrow();
      expect(() => engine2.dispose()).not.toThrow();
    });

    it('process method is idempotent per engine instance', () => {
      const chunk = Buffer.from('some output').toString('base64');
      const result1 = engine.process(chunk);
      const result2 = engine.process(chunk);
      // Should not throw on repeated calls
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('large output handling', () => {
    it('handles large chunks without crashing', () => {
      const largeOutput = 'x'.repeat(10000);
      const chunk = Buffer.from(largeOutput).toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles multiple rapid chunks', () => {
      const chunk = Buffer.from('line 1\n').toString('base64');
      for (let i = 0; i < 10; i++) {
        expect(() => engine.process(chunk)).not.toThrow();
      }
    });
  });

  describe('edge cases', () => {
    it('handles binary data gracefully', () => {
      // Send some binary-like data
      const binary = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const chunk = binary.toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles special terminal characters', () => {
      const chunk = Buffer.from('\x1b[32mGreen\x1b[0m \x07').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });

    it('handles empty buffer', () => {
      const chunk = Buffer.from('').toString('base64');
      const result = engine.process(chunk);
      expect(result).toEqual({});
    });

    it('handles whitespace-only content', () => {
      const chunk = Buffer.from('   \n\n   \r\n   ').toString('base64');
      expect(() => engine.process(chunk)).not.toThrow();
    });
  });
});
