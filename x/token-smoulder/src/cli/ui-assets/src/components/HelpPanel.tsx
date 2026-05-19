import { TERM_HELP, RISK_HELP, STATUS_HELP } from '../lib/help';

function Section({ title, entries }: { title: string; entries: Record<string, string> }) {
  return (
    <div className="help-section-block">
      <div className="help-section">{title}</div>
      <div className="help-grid">
        {Object.entries(entries).map(([term, def]) => (
          <div key={term} className="help-row">
            <span className="help-term">{term}</span>
            <span className="help-def">{def}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HelpPanel() {
  return (
    <div className="panel-body">
      <Section title="Terms" entries={TERM_HELP} />
      <Section title="Risk classes" entries={RISK_HELP} />
      <Section title="Run statuses" entries={STATUS_HELP} />
    </div>
  );
}
