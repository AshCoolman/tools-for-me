import { executeAgentWork } from '../../../../src/core/runner.js';

export const executor = executeAgentWork(({ work }) => ({
  riskClass: 'destructive',
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),
  promptFlow: ['/dangerous'],
  stopConditions: ['fatal_error'],
}));
