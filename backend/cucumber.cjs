module.exports = {
  default: {
    paths: ['test/features/**/*.feature'],
    requireModule: ['ts-node/register'],
    require: ['test/support/**/*.ts', 'test/steps/**/*.ts'],
    format: ['progress-bar', 'summary'],
    strict: true,
  },
};
