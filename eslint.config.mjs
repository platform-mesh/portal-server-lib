// @ts-check
import tsPlugin from 'typescript-eslint';

export default tsPlugin.config(
  ...tsPlugin.configs.recommended,
  {
    ignores: ['dist'],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tsPlugin.configs.disableTypeChecked],
  },
);
