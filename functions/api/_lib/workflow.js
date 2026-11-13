export const WORKFLOW_PATH = '.github/workflows/jules-web-agent.yml';

// Escaped \${ keeps GitHub expression syntax literal inside a JS template string.
export const WORKFLOW_YAML = `name: Jules Web Agent
on:
  workflow_dispatch:
    inputs:
      user_prompt:
        description: 'Prompt for Gemini CLI'
        required: true
        type: string
jobs:
  run-gemini:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: google-github-actions/run-gemini-cli@v0
        with:
          gemini_api_key: \${{ secrets.GEMINI_API_KEY }}
          prompt: \${{ inputs.user_prompt }}
`;