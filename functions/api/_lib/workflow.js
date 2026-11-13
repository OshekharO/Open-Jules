export const WORKFLOW_PATH = '.github/workflows/jules-web-agent.yml';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Escaped \${ keeps GitHub expression syntax literal inside a JS template string.
export const WORKFLOW_YAML = `name: Jules Web Agent
on:
  workflow_dispatch:
    inputs:
      user_prompt:
        description: 'Prompt for Gemini CLI'
        required: true
        type: string
      gemini_model:
        description: 'Gemini model to run'
        required: false
        default: '${DEFAULT_GEMINI_MODEL}'
        type: string
jobs:
  run-gemini:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    env:
      # Gemini CLI refuses to run in an untrusted directory. GitHub Actions
      # checkouts are always untrusted, so mark the workspace trusted.
      GEMINI_CLI_TRUST_WORKSPACE: 'true'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: google-github-actions/run-gemini-cli@v0
        with:
          gemini_api_key: \${{ secrets.GEMINI_API_KEY }}
          prompt: \${{ inputs.user_prompt }}
          gemini_model: \${{ inputs.gemini_model }}
`;