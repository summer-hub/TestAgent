import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['tests/fixtures/**'],
    // e2e only runs with CI=true or explicit --project e2e
    ...(process.env.CI ? {
      include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts', 'tests/e2e/**/*.test.ts'],
    } : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/index.ts',
        '**/__tests__/**',
        '**/__mocks__/**',
        'coverage/**',
        'reports/**'
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      },
      reportOnFailure: true,
      cleanOnRerun: true
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    retries: 2,
    bail: 1,
    reporters: ['default', 'verbose'],
    outputFile: {
      json: './reports/vitest-results.json'
    },
    environmentMatchGlobs: [
      ['**/hypium/**/*.test.ts', 'node'],
      ['**/mcp/**/*.test.ts', 'node'],
      ['**/agent/**/*.test.ts', 'node']
    ],
    sequence: {
      setupFiles: 'list',
      tests: 'list'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@core/interfaces': path.resolve(__dirname, './src/core/interfaces'),
      '@core/types': path.resolve(__dirname, './src/core/types'),
      '@core/errors': path.resolve(__dirname, './src/core/errors'),
      '@hypium': path.resolve(__dirname, './src/hypium'),
      '@fixer': path.resolve(__dirname, './src/fixer'),
      '@fixer/diagnoser': path.resolve(__dirname, './src/fixer/diagnoser'),
      '@fixer/decision': path.resolve(__dirname, './src/fixer/decision'),
      '@fixer/executor': path.resolve(__dirname, './src/fixer/executor'),
      '@fixer/strategies': path.resolve(__dirname, './src/fixer/strategies'),
      '@mcp': path.resolve(__dirname, './src/mcp'),
      '@mcp/protocol': path.resolve(__dirname, './src/mcp/protocol'),
      '@mcp/server': path.resolve(__dirname, './src/mcp/server'),
      '@mcp/client': path.resolve(__dirname, './src/mcp/client'),
      '@mcp/tools': path.resolve(__dirname, './src/mcp/tools'),
      '@agent': path.resolve(__dirname, './src/agent'),
      '@agent/react-loop': path.resolve(__dirname, './src/agent/react-loop'),
      '@agent/llm': path.resolve(__dirname, './src/agent/llm'),
      '@agent/context': path.resolve(__dirname, './src/agent/context'),
      '@skills': path.resolve(__dirname, './src/skills'),
      '@skills/base': path.resolve(__dirname, './src/skills/base'),
      '@skills/registry': path.resolve(__dirname, './src/skills/registry'),
      '@skills/harmonyos': path.resolve(__dirname, './src/skills/harmonyos'),
      '@knowledge': path.resolve(__dirname, './src/knowledge'),
      '@knowledge/store': path.resolve(__dirname, './src/knowledge/store'),
      '@knowledge/retriever': path.resolve(__dirname, './src/knowledge/retriever'),
      '@utils': path.resolve(__dirname, './src/utils')
    }
  },
  server: {
    port: 3000,
    strictPort: true
  }
});
