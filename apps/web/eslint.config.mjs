// Next 15 still uses legacy `.eslintrc` config under the hood for its plugin.
// Re-exporting the shared flat config here keeps `next lint` happy via fallback.
import config from '@ces/eslint-config';
export default config;
