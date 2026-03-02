/**
 * Maintainability ESLint config — runs as a separate CI job via:
 *   npm run lint:maintainability
 *
 * Keeps stricter structural rules separate from the base lint config so that:
 *  - The main `.eslintrc.cjs` stays focused on correctness and style
 *  - Maintainability violations are visible but can be tightened independently
 *
 * Rule levels:
 *  "error" — hard requirement; must pass before merging
 *  "warn"  — advisory; visible in CI output but does not fail the build
 *
 * See .claude/CLAUDE.md § Coding Standards for the full specification.
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],

  // Only lint source files — tests have different structural norms
  ignorePatterns: ['dist/**', 'node_modules/**', 'tests/**'],

  rules: {
    // ── Naming conventions ──────────────────────────────────────────────────

    '@typescript-eslint/naming-convention': [
      'error',
      // Default: camelCase for everything unless overridden below
      {
        selector: 'default',
        format: ['camelCase'],
        leadingUnderscore: 'allow',
        trailingUnderscore: 'forbid',
      },
      // Variables: camelCase, UPPER_CASE (module constants), PascalCase (class instances)
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        leadingUnderscore: 'allow',
        trailingUnderscore: 'forbid',
      },
      // Functions: camelCase only (no React components in this project)
      {
        selector: 'function',
        format: ['camelCase'],
        leadingUnderscore: 'allow',
      },
      // Import bindings: camelCase or PascalCase (for class/type imports)
      {
        selector: 'import',
        format: ['camelCase', 'PascalCase'],
      },
      // Object literal properties: camelCase or UPPER_CASE
      {
        selector: 'objectLiteralProperty',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
      },
      // Type properties: camelCase or UPPER_CASE (UPPER_CASE for env var interfaces
      // like GwitEnvironment whose keys are GWIT_BRANCH, GWIT_PORT, etc.)
      {
        selector: 'typeProperty',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
      },
      // Types, interfaces, classes, enums: PascalCase; no "I" prefix
      {
        selector: 'typeLike',
        format: ['PascalCase'],
        custom: { regex: '^(?!I[A-Z])', match: true },
      },
      // Enum members: UPPER_CASE or PascalCase
      {
        selector: 'enumMember',
        format: ['UPPER_CASE', 'PascalCase'],
      },
      // Allow any name for destructured variables (e.g. from external APIs)
      {
        selector: 'variable',
        modifiers: ['destructured'],
        format: null,
      },
      // Parameters: camelCase, allow leading _ for intentionally unused
      {
        selector: 'parameter',
        format: ['camelCase'],
        leadingUnderscore: 'allow',
      },
    ],

    // ── Import structure ────────────────────────────────────────────────────

    'no-duplicate-imports': 'error',

    // ── Complexity limits (from CLAUDE.md) ──────────────────────────────────

    // Hard limits — enforced now
    complexity: ['error', 20],
    'max-depth': ['error', 5],

    // Soft limits — advisory
    'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    'max-params': ['warn', 5],

    // ── JSDoc requirements ──────────────────────────────────────────────────

    // Require JSDoc on exported function declarations
    'jsdoc/require-jsdoc': [
      'error',
      {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
          MethodDefinition: false,
          ClassDeclaration: false,
        },
      },
    ],
    // Require a description sentence in every JSDoc block
    'jsdoc/require-description': ['error', { descriptionStyle: 'body' }],
    // Require @param for each parameter
    'jsdoc/require-param': ['error', { enableFixer: false, checkDestructured: false }],
    // Require @returns for non-void functions
    'jsdoc/require-returns': ['error', { enableFixer: false }],

    // ── Overrides from base config ──────────────────────────────────────────

    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
}
