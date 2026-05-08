import { executeAgentWork } from '../../src/core/runner.js';

export const executor = executeAgentWork(({ work }) => ({
  riskClass: 'readonly',
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),
  promptFlow: ['TODO(token-smoulder): replace with one or more concrete agent prompts'],
  stopConditions: ['fatal_error'],
}));
