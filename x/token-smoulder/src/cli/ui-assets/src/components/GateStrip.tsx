import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PREDICATE_TO_GATE } from '../lib/predicate-map';
import { friendlyGateName } from '../lib/help';

type GateStatus = 'pass' | 'fail' | 'none';
type GateMap = Record<string, GateStatus>;
type GateDetail = Record<string, { status: GateStatus; predicates: string[] }>;

const GATE_CATEGORIES = ['capacity', 'contention', 'value', 'risk'] as const;

const GATE_LABELS: Record<string, string> = {
  capacity: 'capacity',
  contention: 'contention',
  value: 'value',
  risk: 'safety',
};

function parseDecision(decision: { reasons?: string[]; failedReasons?: string[] }): GateDetail {
  const result: GateDetail = {};
  for (const cat of GATE_CATEGORIES) {
    result[cat] = { status: 'none', predicates: [] };
  }
  for (const r of decision.reasons ?? []) {
    const predicate = r.split('(')[0].trim();
    const gate = PREDICATE_TO_GATE[predicate];
    if (gate) {
      result[gate].predicates.push(`✓ ${friendlyGateName(r)}`);
      if (result[gate].status !== 'fail') result[gate].status = 'pass';
    }
  }
  for (const r of decision.failedReasons ?? []) {
    const predicate = r.split('(')[0].trim();
    const gate = PREDICATE_TO_GATE[predicate];
    if (gate) {
      result[gate].predicates.push(`✗ ${friendlyGateName(r)}`);
      result[gate].status = 'fail';
    }
  }
  return result;
}

type Props = {
  unitName: string;
  focusedGate: string | null;
  onGateClick?: (gate: string) => void;
};

export function GateStrip({ unitName, focusedGate, onGateClick }: Props) {
  const [gates, setGates] = useState<GateDetail>(() => {
    const init: GateDetail = {};
    for (const cat of GATE_CATEGORIES) init[cat] = { status: 'none', predicates: [] };
    return init;
  });

  useEffect(() => {
    let cancelled = false;

    const fetch = () => {
      api.get<{ decision?: { reasons?: string[]; failedReasons?: string[] } }>(`/api/units/${encodeURIComponent(unitName)}/state`)
        .then(record => {
          if (!cancelled && record?.decision) setGates(parseDecision(record.decision));
        })
        .catch(() => {});
    };

    fetch();
    const id = setInterval(fetch, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [unitName]);

  return (
    <div className="gate-strip">
      {GATE_CATEGORIES.map(cat => {
        const detail = gates[cat];
        const focused = focusedGate === cat;
        const tooltip = detail.predicates.length > 0
          ? detail.predicates.join('\n')
          : 'No data yet';
        return (
          <span
            key={cat}
            className={`gate-pill gate-pill--${detail.status}${focused ? ' gate-pill--focused' : ''}${onGateClick ? ' gate-pill--clickable' : ''}`}
            title={tooltip}
            onClick={() => onGateClick?.(cat)}
          >
            <span className="gate-pill-dot" />
            {GATE_LABELS[cat]}
          </span>
        );
      })}
    </div>
  );
}
