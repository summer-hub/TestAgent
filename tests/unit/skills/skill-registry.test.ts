/**
 * SkillRegistry 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Skill, type SkillContext, type SkillMetadata, type SkillResult } from '@skills/skill-base';
import { SkillRegistry } from '@skills/skill-registry';

// Test skill implementation
class FakeSkill extends Skill {
  readonly metadata: SkillMetadata;

  constructor(
    name: string,
    opts?: { required?: string[]; tags?: string[] }
  ) {
    super();
    this.metadata = {
      name,
      description: `Test skill: ${name}`,
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: opts?.required ?? [],
      },
      tags: opts?.tags ?? [],
      version: '1.0.0',
    };
  }

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    return { success: true, message: `Executed ${this.metadata.name}`, output: params };
  }
}

class FailingSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'failing',
    description: 'Always fails',
    parameters: { type: 'object', properties: {} },
    version: '1.0.0',
  };

  async execute(_params: Record<string, any>, _context: SkillContext): Promise<SkillResult> {
    throw new Error('Intentional failure');
  }
}

function createMockContext(): SkillContext {
  return {
    driver: {} as any,
    variables: {},
  };
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('register', () => {
    it('should register a skill', () => {
      const name = registry.register(new FakeSkill('test-skill'));
      expect(name).toBe('test-skill');
      expect(registry.size).toBe(1);
    });

    it('should register with namespace', () => {
      const name = registry.register(new FakeSkill('click'), { namespace: 'harmony' });
      expect(name).toBe('harmony.click');
    });

    it('should register aliases', () => {
      registry.register(new FakeSkill('navigate'), { aliases: ['nav', 'goto'] });
      expect(registry.get('nav')).not.toBeNull();
      expect(registry.get('goto')).not.toBeNull();
      expect(registry.get('navigate')).not.toBeNull();
    });

    it('should throw on duplicate name', () => {
      registry.register(new FakeSkill('unique'));
      expect(() => registry.register(new FakeSkill('unique'))).toThrow('already registered');
    });

    it('should throw on duplicate alias', () => {
      registry.register(new FakeSkill('a'), { aliases: ['shared'] });
      expect(() => registry.register(new FakeSkill('b'), { aliases: ['shared'] })).toThrow(
        'already exists'
      );
    });
  });

  describe('unregister', () => {
    it('should unregister by name', () => {
      const name = registry.register(new FakeSkill('removable'));
      expect(registry.unregister(name)).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('should unregister by alias', () => {
      registry.register(new FakeSkill('main'), { aliases: ['alt'] });
      expect(registry.unregister('alt')).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('should return false for unknown skill', () => {
      expect(registry.unregister('unknown')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return skill instance', () => {
      registry.register(new FakeSkill('getter'));
      expect(registry.get('getter')).toBeInstanceOf(FakeSkill);
    });

    it('should return null for unknown', () => {
      expect(registry.get('nope')).toBeNull();
    });

    it('should return null for disabled skill', () => {
      registry.register(new FakeSkill('disabled'), { enabled: false });
      expect(registry.get('disabled')).toBeNull();
    });
  });

  describe('has', () => {
    it('should check skill existence', () => {
      expect(registry.has('exists')).toBe(false);
      registry.register(new FakeSkill('exists'));
      expect(registry.has('exists')).toBe(true);
    });
  });

  describe('list', () => {
    it('should list all skill metadata', () => {
      registry.register(new FakeSkill('a', { tags: ['ui'] }));
      registry.register(new FakeSkill('b', { tags: ['data'] }));
      const list = registry.list();
      expect(list).toHaveLength(2);
    });

    it('should filter by tag', () => {
      registry.register(new FakeSkill('a', { tags: ['ui'] }));
      registry.register(new FakeSkill('b', { tags: ['data'] }));
      const list = registry.list({ tag: 'ui' });
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('a');
    });
  });

  describe('enable/disable', () => {
    it('should toggle enabled state', () => {
      const name = registry.register(new FakeSkill('toggle'));
      expect(registry.get('toggle')).not.toBeNull();
      registry.disable(name);
      expect(registry.get('toggle')).toBeNull();
      registry.enable(name);
      expect(registry.get('toggle')).not.toBeNull();
    });
  });

  describe('execute', () => {
    it('should execute a skill', async () => {
      registry.register(new FakeSkill('runner'));
      const result = await registry.execute('runner', { text: 'hello' }, createMockContext());
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ text: 'hello' });
    });

    it('should return error for unknown skill', async () => {
      const result = await registry.execute('unknown', {}, createMockContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('SKILL_NOT_FOUND');
    });

    it('should validate params', async () => {
      registry.register(new FakeSkill('validated', { required: ['text'] }));
      const result = await registry.execute('validated', {}, createMockContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });

    it('should handle execution errors', async () => {
      registry.register(new FailingSkill());
      const result = await registry.execute('failing', {}, createMockContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('Intentional failure');
    });
  });

  describe('compositions', () => {
    it('should execute composition', async () => {
      registry.register(new FakeSkill('step1'));
      registry.register(new FakeSkill('step2'));
      registry.registerComposition({
        name: 'two-steps',
        description: 'Two step composition',
        steps: [
          { skillName: 'step1', params: { text: 'a' } },
          { skillName: 'step2', params: { text: 'b' } },
        ],
      });

      const result = await registry.executeComposition('two-steps', createMockContext());
      expect(result.success).toBe(true);
      expect(result.metadata?.stepResults).toHaveLength(2);
    });

    it('should handle step failure with fallback', async () => {
      registry.register(new FailingSkill());
      registry.register(new FakeSkill('fallback'));
      registry.registerComposition({
        name: 'safe',
        description: 'With fallback',
        steps: [
          {
            skillName: 'failing',
            params: {},
            fallback: 'fallback',
          },
        ],
      });

      const result = await registry.executeComposition('safe', createMockContext());
      expect(result.success).toBe(true);
      expect(result.metadata?.stepResults).toHaveLength(1);
    });

    it('should allow failure if flagged', async () => {
      registry.register(new FailingSkill());
      registry.registerComposition({
        name: 'optional',
        description: 'Allow failure',
        steps: [{ skillName: 'failing', params: {}, allowFailure: true }],
      });

      const result = await registry.executeComposition('optional', createMockContext());
      expect(result.success).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all skills', () => {
      registry.register(new FakeSkill('a'));
      registry.register(new FakeSkill('b'));
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });
});
