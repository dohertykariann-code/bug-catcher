import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineWorkspace([
  {
    test: {
      name: 'server',
      environment: 'node',
      include: ['src/server/**/__tests__/**/*.test.ts'],
    },
  },
  {
    plugins: [react()],
    test: {
      name: 'react',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/react/setupTests.ts'],
      include: ['src/react/**/__tests__/**/*.test.{ts,tsx}'],
    },
  },
]);
