import { executeAgentWork } from '../../../../src/core/runner.js';

export const executor = executeAgentWork(({ work }) => ({
  riskClass: 'readonly',
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),
  promptFlow: ['step-0', 'step-1'],
  stopConditions: ['fatal_error'],
}));
