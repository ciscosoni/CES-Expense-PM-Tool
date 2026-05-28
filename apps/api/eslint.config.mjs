import config from '@ces/eslint-config';

export default [
  ...config,
  {
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
