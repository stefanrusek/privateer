// Run under Bun (`bun --bun cucumber-js`) so .ts step definitions and World
// load natively without a transpiling loader.
export default {
  import: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
  paths: ['features/**/*.feature'],
  format: ['summary'],
};
