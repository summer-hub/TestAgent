/**
 * EventSystem 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventSystem, AgentEventType } from '@agent/events/event-system';

describe('EventSystem', () => {
  let events: EventSystem;

  beforeEach(() => {
    events = new EventSystem();
  });

  describe('on', () => {
    it('should register listener and return id', () => {
      const handler = vi.fn();
      const id = events.on(AgentEventType.STEP_START, handler);
      expect(id).toMatch(/^listener-/);
      expect(events.listenerCount).toBe(1);
    });

    it('should support priority', async () => {
      const order: number[] = [];
      events.on(AgentEventType.STEP_START, () => order.push(1), { priority: 10 });
      events.on(AgentEventType.STEP_START, () => order.push(2), { priority: 5 });

      await events.emit(AgentEventType.STEP_START, { stepId: '1' });
      expect(order).toEqual([2, 1]); // lower priority = earlier
    });

    it('should support wildcard listeners', async () => {
      const handler = vi.fn();
      events.on('*', handler);
      await events.emit(AgentEventType.STEP_START, {});
      await events.emit(AgentEventType.FIX_START, {});

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler.mock.calls[0]![0].type).toBe(AgentEventType.STEP_START);
      expect(handler.mock.calls[1]![0].type).toBe(AgentEventType.FIX_START);
    });
  });

  describe('once', () => {
    it('should fire only once', async () => {
      const handler = vi.fn();
      events.once(AgentEventType.AGENT_COMPLETE, handler);
      await events.emit(AgentEventType.AGENT_COMPLETE, {});
      await events.emit(AgentEventType.AGENT_COMPLETE, {});

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit', () => {
    it('should deliver event to matching listeners', async () => {
      const handler = vi.fn();
      events.on(AgentEventType.STEP_END, handler);
      await events.emit(AgentEventType.STEP_END, { stepId: '1', status: 'success' });

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0]![0];
      expect(event.type).toBe(AgentEventType.STEP_END);
      expect(event.data).toEqual({ stepId: '1', status: 'success' });
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should set source if provided', async () => {
      const handler = vi.fn();
      events.on(AgentEventType.AGENT_ERROR, handler);
      await events.emit(AgentEventType.AGENT_ERROR, { msg: 'boom' }, 'react-processor');

      expect(handler.mock.calls[0]![0].source).toBe('react-processor');
    });

    it('should not deliver to different event type', async () => {
      const handler = vi.fn();
      events.on(AgentEventType.STEP_START, handler);
      await events.emit(AgentEventType.STEP_END, {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('should remove listener', () => {
      const handler = vi.fn();
      const id = events.on(AgentEventType.STEP_START, handler);
      expect(events.off(id)).toBe(true);
      expect(events.listenerCount).toBe(0);
    });

    it('should return false for unknown id', () => {
      expect(events.off('unknown')).toBe(false);
    });

    it('should properly remove once listener before firing', async () => {
      const handler = vi.fn();
      const id = events.once(AgentEventType.STEP_START, handler);
      events.off(id);
      await events.emit(AgentEventType.STEP_START, {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('should record emitted events', async () => {
      await events.emit(AgentEventType.STEP_START, { id: 1 });
      await events.emit(AgentEventType.STEP_END, { id: 2 });
      await events.emit(AgentEventType.AGENT_COMPLETE, { id: 3 });

      const history = events.getHistory();
      expect(history).toHaveLength(3);
    });

    it('should filter history by type', async () => {
      await events.emit(AgentEventType.STEP_START, {});
      await events.emit(AgentEventType.STEP_END, {});

      const stepStarts = events.getHistory(AgentEventType.STEP_START);
      expect(stepStarts).toHaveLength(1);
    });

    it('should clear history', async () => {
      await events.emit(AgentEventType.STEP_START, {});
      events.clearHistory();
      expect(events.getHistory()).toHaveLength(0);
    });
  });

  describe('removeAllListeners', () => {
    it('should clear all listeners', () => {
      events.on(AgentEventType.STEP_START, vi.fn());
      events.on(AgentEventType.STEP_END, vi.fn());
      events.on('*', vi.fn());
      events.removeAllListeners();
      expect(events.listenerCount).toBe(0);
    });
  });

  describe('error isolation', () => {
    it('should not block other listeners on error', async () => {
      const goodHandler = vi.fn();
      events.on(AgentEventType.STEP_START, () => {
        throw new Error('BOOM');
      });
      events.on(AgentEventType.STEP_START, goodHandler);

      await events.emit(AgentEventType.STEP_START, {});
      expect(goodHandler).toHaveBeenCalled();
    });
  });
});
