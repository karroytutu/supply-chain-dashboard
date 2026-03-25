module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // 文件大小限制
    'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],

    // 复杂度限制
    'complexity': ['warn', 10],
    'max-depth': ['warn', 3],
    'max-params': ['warn', 4],

    // 代码质量
    'no-duplicate-imports': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // React 规则
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',

    // TypeScript 规则
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // 后端代码
      files: ['server/**/*.ts'],
      rules: {
        'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      // 前端组件
      files: ['src/**/*.tsx'],
      rules: {
        'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.umi/',
    '*.config.js',
    '*.d.ts',
  ],
};
