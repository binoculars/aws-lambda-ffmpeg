# 3.1.0
- feature: Use node.js 6.10 runtime on lambda and locally
  - `nvm use 6.10` locally (required)
- feature: Include FFmpeg license info in CI builds
- maintenance: Update syntax to use node.js 6 ES2015 features
- maintenance: Update gulp-install to latest version (1.1.0)

# 3.0.0
- feature: Use Lambda environment variables instead of config.json (breaking change)
- feature: Limit columns for logs
- bugfix: Clean up after integration test failure
- maintenance: Update dependencies, now using greenkeeper

# 2.3.1
- bugfix: CloudFormation template - ExecutionRolePolicy property roles must be an array 

# 2.3.0
- maintenance: Update dependencies
- feature: Use Yarn package manager
- feature: Integration testing!
  - CI Bootstrap template
  - Travis configuration
  - Update Gulp deployment for CI integration testing

# 2.2.0
- meta: Start keeping a Changelog
- bugfix: #21 (caused by gulp-chmod upgrade in 2.1.0)
- feature: Use environment variable `STACK_NAME` for the stack name, if present in the gulp build
