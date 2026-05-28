import config from '@ces/eslint-config';

export default [
  ...config,
  {
    rules: {
      // NestJS has lots of empty marker classes for modules, decorators, etc.
      '@typescript-eslint/no-extraneous-class': 'off',
      // NestJS DI uses constructor parameter types at runtime (via emitDecoratorMetadata).
      // The `consistent-type-imports` auto-fix breaks DI by converting Service classes to
      // type-only imports. Disable for the API workspace; rely on TS to optimize away.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Zod DTO pattern: `class Foo extends createZodDto(schema)` + `interface Foo extends z.infer<...>`
      // is the canonical way to give DTO instances their inferred shape.
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
];
