import { executeAgentWork } from '../../../../src/core/runner.js';

export const executor = executeAgentWork(({ work }) => ({
  riskClass: 'low-risk-write',
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),
  promptFlow: ['/lint --propose'],
  stopConditions: ['fatal_error', 'human_input_required'],
}));
