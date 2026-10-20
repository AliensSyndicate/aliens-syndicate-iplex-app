import { defineConfig } from 'vitest/config'

// Testes unitários do shell (lógica sem TV). A validação no aparelho é feita por `npm run tv`.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    restoreMocks: true,
    // O Design System verifica o próprio CSS (importado com ?raw).
    css: { include: [/src\/design-system\/.+\.css/] },
  },
})
