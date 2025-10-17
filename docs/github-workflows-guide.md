# GitHub Workflows Configuration Guide

## Overview

This repository uses intelligent, swarm-powered GitHub Actions workflows that leverage Claude Flow's multi-agent orchestration capabilities for automated CI/CD, testing, security scanning, and release management.

## Available Workflows

### 1. Swarm CI (`swarm-ci.yml`)

**Purpose**: Intelligent continuous integration with multi-agent code analysis

**Triggers**:
- Push to `main`, `develop`, or `experimental` branches
- Pull requests to `main` or `experimental`
- Manual workflow dispatch

**Features**:
- 🤖 Mesh topology with 6 specialized agents
- 📊 Intelligent test selection based on code changes
- ⚡ Parallel quality checks (linting, type checking)
- 📈 Performance impact analysis
- 📋 Automated analysis reports on PRs

**Agents Used**:
- `code-analyzer` - Analyzes code quality and patterns
- `tester` - Optimizes test selection and execution
- `reviewer` - Reviews code changes
- `security-manager` - Performs security validation

**Jobs**:
1. `swarm-analysis` - Multi-agent code analysis with intelligent test selection
2. `swarm-security` - Adaptive security scanning with dependency analysis
3. `swarm-build` - Parallel build process with artifact verification
4. `status-report` - Comprehensive status reporting

### 2. PR Validation Swarm (`swarm-pr-validation.yml`)

**Purpose**: Comprehensive pull request validation with multi-agent analysis

**Triggers**:
- Pull request opened, synchronized, reopened, or marked ready for review
- Only runs on non-draft PRs

**Features**:
- 🔍 Deep code quality analysis
- 🧪 Test coverage tracking
- 🛡️ Security validation and sensitive file detection
- 📚 Documentation completeness check
- 📊 Detailed validation reports posted as PR comments
- 🔄 Updates existing comments instead of creating duplicates

**Agents Used**:
- `code-analyzer` - Analyzes code quality
- `reviewer` - Reviews PR changes
- `tester` - Validates test coverage
- `security-manager` - Security analysis
- `api-docs` - Documentation validation

**Validation Checks**:
1. **Code Quality**
   - ESLint linting
   - TypeScript type checking

2. **Testing**
   - Full test suite execution
   - Coverage analysis

3. **Security**
   - NPM audit
   - Sensitive file detection

4. **Documentation**
   - Checks if significant code changes need documentation updates

### 3. Release Automation (`swarm-release.yml`)

**Purpose**: Intelligent release automation with changelog generation

**Triggers**:
- Push of version tags (e.g., `v2.5.0`, `v2.5.0-alpha.140`)
- Manual workflow dispatch with version input

**Features**:
- 📝 Automated changelog generation from commits
- 📊 Release impact analysis
- 🧪 Comprehensive testing before release
- 📦 NPM package publishing
- 🎉 GitHub release creation
- 🏷️ Support for alpha, beta, and production releases

**Agents Used**:
- `release-manager` - Orchestrates release process
- `code-analyzer` - Analyzes release impact
- `api-docs` - Ensures documentation is current

**Jobs**:
1. `release-preparation` - Analyzes changes and generates changelog
2. `build-and-test` - Runs comprehensive tests and builds artifacts
3. `publish-release` - Publishes to NPM and creates GitHub release
4. `post-release` - Generates release report

## Configuration Requirements

### Secrets

To enable full functionality, configure these repository secrets:

1. **NPM_TOKEN** (Required for NPM publishing)
   - Go to Settings → Secrets and variables → Actions
   - Add secret: `NPM_TOKEN`
   - Value: Your NPM automation token
   - Get token from: https://www.npmjs.com/settings/[username]/tokens

### Permissions

The workflows require these permissions:

- **Contents**: write (for creating releases)
- **Pull requests**: write (for PR comments)
- **Security events**: write (for security scanning)
- **ID token**: write (for NPM provenance)

These are configured per-workflow in the YAML files.

## Usage

### Running Workflows Manually

#### Trigger Release

```bash
# Using GitHub CLI
gh workflow run swarm-release.yml \
  -f version="2.5.1-alpha.1" \
  -f tag="alpha"

# Via GitHub UI
# Navigate to Actions → Intelligent Release Automation → Run workflow
```

#### Trigger Swarm CI

```bash
gh workflow run swarm-ci.yml
```

### Monitoring Workflows

```bash
# List recent workflow runs
gh run list

# View specific run
gh run view <run-id>

# Watch live run
gh run watch <run-id>
```

### Understanding Workflow Outputs

Each workflow provides detailed outputs:

1. **Artifacts**:
   - `swarm-analysis-report` - Detailed CI analysis
   - `pr-validation-results` - PR validation results
   - `security-reports` - Security scan results
   - `build-artifacts` - Compiled build outputs
   - `release-package` - Release package files

2. **PR Comments**:
   - Swarm CI posts analysis summaries
   - PR Validation posts comprehensive validation reports
   - Comments are updated on subsequent runs (no spam)

3. **Status Checks**:
   - All workflows report status to PR checks
   - Failed checks block PR merging (if configured)

## Swarm Topology

### Mesh Topology (Swarm CI)

```
┌─────────────┐
│   Swarm CI  │
└──────┬──────┘
       │
   ┌───┴───┬───────┬──────────┐
   │       │       │          │
┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌────▼────┐
│Code │ │Test │ │Rev  │ │Security │
│Anlz │ │Agent│ │Agent│ │ Manager │
└─────┘ └─────┘ └─────┘ └─────────┘
```

All agents communicate in a peer-to-peer mesh with shared memory.

### Hierarchical Topology (PR Validation & Release)

```
        ┌──────────┐
        │  Queen   │
        │Coordinator│
        └────┬─────┘
             │
    ┌────────┼────────┬────────┐
    │        │        │        │
┌───▼──┐  ┌──▼──┐  ┌─▼──┐  ┌──▼────┐
│Code  │  │Test │  │Rev │  │Security│
│Anlz  │  │Agent│  │Agt │  │Manager │
└──────┘  └─────┘  └────┘  └────────┘
```

Queen coordinates specialized workers in hierarchical pattern.

## Optimization Tips

### 1. Reduce Workflow Run Time

- **Smart Test Selection**: The swarm automatically selects relevant tests based on changed files
- **Parallel Execution**: Quality checks run in parallel
- **Conditional Jobs**: Some jobs only run when necessary

### 2. Cost Optimization

- **Branch Protection**: Configure branch protection to require status checks
- **Concurrent Limits**: Workflows automatically cancel redundant runs
- **Artifact Retention**: Set appropriate retention periods for artifacts

### 3. Security Best Practices

- **Secret Scanning**: Enable GitHub secret scanning
- **Dependency Review**: Enable Dependabot
- **OIDC Tokens**: Use OIDC instead of long-lived tokens where possible

## Troubleshooting

### Workflow Fails on `npm ci`

**Cause**: Dependency installation issues

**Solution**:
```bash
# Clear npm cache locally
npm cache clean --force

# Update package-lock.json
npm install

# Commit changes
git add package-lock.json
git commit -m "fix: update package-lock.json"
```

### PR Validation Comment Not Posted

**Cause**: Missing `pull-requests: write` permission

**Solution**: Verify workflow permissions in YAML file:
```yaml
permissions:
  pull-requests: write
```

### Release Publishing Fails

**Cause**: Missing or invalid NPM_TOKEN

**Solution**:
1. Generate NPM token: https://www.npmjs.com/settings/[username]/tokens
2. Add to repository secrets as `NPM_TOKEN`
3. Ensure token has publish permissions

### Swarm Initialization Fails

**Cause**: Claude Flow not installed or outdated

**Solution**:
```bash
# Update to latest alpha version
npm install claude-flow@alpha

# Or use npx (always fetches latest)
npx claude-flow@alpha --version
```

## Advanced Configuration

### Custom Agent Configuration

You can modify the agent types and counts in the workflows:

```yaml
# In swarm-ci.yml
- name: Initialize Swarm Topology
  run: |
    npx claude-flow@alpha mcp swarm_init \
      --topology mesh \
      --max-agents 10 \  # Increase agent count
      --enable-memory
```

### Custom Test Selection Rules

Modify the smart test selection logic:

```yaml
# In swarm-ci.yml, Smart Test Selection step
- name: Smart Test Selection
  run: |
    # Add custom rules for your project
    if grep -q "database" changed_files.txt; then
      npm run test:integration:database
    fi
```

### Workflow Dependencies

Create workflow dependencies for complex pipelines:

```yaml
# In your custom workflow
jobs:
  custom-job:
    runs-on: ubuntu-latest
    needs: [swarm-analysis]  # Wait for swarm-ci completion
```

## Integration with Other Tools

### CodeCov Integration

Add to `swarm-ci.yml`:

```yaml
- name: Upload to CodeCov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

### Slack Notifications

Add to workflow:

```yaml
- name: Notify Slack
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

## Metrics and Analytics

Track workflow performance:

```bash
# Get workflow statistics
gh api repos/:owner/:repo/actions/workflows/swarm-ci.yml/runs \
  --jq '.workflow_runs | length'

# Average run time
gh api repos/:owner/:repo/actions/workflows/swarm-ci.yml/runs \
  --jq '[.workflow_runs[].run_duration] | add / length'
```

## Support

For issues with workflows:

1. Check workflow logs in GitHub Actions tab
2. Review [Claude Flow documentation](https://github.com/ruvnet/claude-flow)
3. Open an issue with workflow run ID and error details

---

🤖 Generated by Claude Flow - Intelligent Multi-Agent Orchestration
