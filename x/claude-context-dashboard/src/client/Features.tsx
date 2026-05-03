import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSettings, DEFAULT_SETTINGS, type Settings } from "./Settings.js";

const STORAGE_KEY = "claude-context-dashboard:features";

export type FeatureNode = {
  id: string;
  label: string;
  defaultOn: boolean;
  forced?: boolean;
  children?: FeatureNode[];
};

export const FEATURE_TREE: FeatureNode[] = [
  {
    id: "header",
    label: "Title bar",
    defaultOn: true,
    forced: true,
    children: [
      { id: "header.search", label: "Search", defaultOn: true },
      { id: "header.blurb", label: "Blurb", defaultOn: true },
    ],
  },
  {
    id: "activeSessions",
    label: "Active sessions",
    defaultOn: true,
    forced: true,
    children: [
      { id: "activeSessions.blurb", label: "Blurb", defaultOn: true },
      { id: "activeSessions.window", label: "Window", defaultOn: true },
      {
        id: "activeSessions.contextChart",
        label: "Context chart",
        defaultOn: true,
        children: [
          { id: "activeSessions.contextChart.yAxis", label: "Y-axis", defaultOn: true },
          { id: "activeSessions.contextChart.bands", label: "Threshold bands", defaultOn: true },
          { id: "activeSessions.contextChart.thresholdLines", label: "Threshold lines", defaultOn: false },
          { id: "activeSessions.contextChart.accumulator", label: "Accumulator plot", defaultOn: false },
          { id: "activeSessions.contextChart.context", label: "Context plot", defaultOn: true },
          { id: "activeSessions.contextChart.peak", label: "Peak indicator", defaultOn: false },
        ],
      },
      {
        id: "activeSessions.activity",
        label: "Activity chart",
        defaultOn: false,
        children: [
          { id: "activeSessions.activity.input", label: "Input", defaultOn: true },
          { id: "activeSessions.activity.cacheCreation", label: "Cache create", defaultOn: true },
          { id: "activeSessions.activity.cacheRead", label: "Cache read", defaultOn: true },
          { id: "activeSessions.activity.output", label: "Output", defaultOn: true },
          { id: "activeSessions.activity.cumulative", label: "Cumulative", defaultOn: true },
        ],
      },
      {
        id: "activeSessions.usage",
        label: "Usage chart",
        defaultOn: true,
        children: [
          { id: "activeSessions.usage.session", label: "Session", defaultOn: true },
          { id: "activeSessions.usage.weekly", label: "Weekly", defaultOn: true },
        ],
      },
      {
        id: "activeSessions.rows",
        label: "Rows",
        defaultOn: true,
        children: [
          { id: "activeSessions.rows.bands", label: "Group titles", defaultOn: true },
          { id: "activeSessions.rows.titleBig", label: "Big title", defaultOn: false },
          { id: "activeSessions.rows.titleSmall", label: "Small title", defaultOn: true },
          { id: "activeSessions.rows.prompt", label: "Prompt", defaultOn: true },
          { id: "activeSessions.rows.reply", label: "Reply", defaultOn: false },
          { id: "activeSessions.rows.tags", label: "Usage tags", defaultOn: true },
          { id: "activeSessions.rows.sparkline", label: "Sparkline", defaultOn: true },
          { id: "activeSessions.rows.bar", label: "Bar fill", defaultOn: true },
        ],
      },
    ],
  },
  {
    id: "tokenUsage",
    label: "Token usage (12h)",
    defaultOn: false,
    children: [
      { id: "tokenUsage.blurb", label: "Blurb", defaultOn: true },
      { id: "tokenUsage.peak", label: "Peak indicator", defaultOn: false },
      { id: "tokenUsage.cumulative", label: "Cumulative", defaultOn: true },
      { id: "tokenUsage.usage", label: "Usage", defaultOn: true },
    ],
  },
  {
    id: "kpis",
    label: "KPIs",
    defaultOn: false,
    children: [
      { id: "kpis.sessions", label: "Sessions", defaultOn: true },
      { id: "kpis.tokens", label: "Total tokens", defaultOn: true },
      { id: "kpis.avgPct", label: "Avg context", defaultOn: true },
    ],
  },
];

const FAMILY_HUE: Record<string, number> = {
  header: 210,
  activeSessions: 280,
  contextChart: 280,
  activity: 35,
  usage: 145,
  rows: 340,
  tokenUsage: 190,
  kpis: 255,
};

const COLOR_GROUP_KEYS = new Set(["contextChart", "activity", "usage", "rows"]);

const flatten = (nodes: FeatureNode[]): FeatureNode[] => {
  const out: FeatureNode[] = [];
  const walk = (n: FeatureNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
};

const FLAT = flatten(FEATURE_TREE);
const NODE_BY_ID = new Map(FLAT.map((n) => [n.id, n]));

const buildDefaults = (): Record<string, boolean> => {
  const o: Record<string, boolean> = {};
  for (const n of FLAT) o[n.id] = n.defaultOn;
  return o;
};

type FeaturesState = Record<string, boolean>;

type Ctx = {
  state: FeaturesState;
  editMode: boolean;
  setEnabled: (id: string, v: boolean) => void;
  setEditMode: (v: boolean) => void;
  resetDefaults: () => void;
};

const FeaturesCtx = createContext<Ctx | null>(null);

const familyOf = (id: string): string => {
  const parts = id.split(".");
  if (parts[0] === "activeSessions" && parts.length >= 2 && COLOR_GROUP_KEYS.has(parts[1])) {
    return parts[1];
  }
  return parts[0];
};
const depthOf = (id: string): number => id.split(".").length - 1;

const isVisible = (state: FeaturesState, id: string): boolean => {
  const parts = id.split(".");
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}.${p}` : p;
    if (state[acc] === false) return false;
  }
  return true;
};

export const FeaturesProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<FeaturesState>(() => {
    const defaults = buildDefaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as FeaturesState;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });
  const [editMode, setEditMode] = useState(false);

  const setEnabled = useCallback((id: string, v: boolean) => {
    setState((prev) => {
      const node = NODE_BY_ID.get(id);
      if (!node) return prev;
      if (node.forced && !v) return prev;
      const next = { ...prev, [id]: v };

      if (v) {
        const parts = id.split(".");
        let acc = "";
        for (const p of parts) {
          acc = acc ? `${acc}.${p}` : p;
          next[acc] = true;
        }
      } else {
        const parts = id.split(".");
        while (parts.length > 1) {
          parts.pop();
          const parentId = parts.join(".");
          const parentNode = NODE_BY_ID.get(parentId);
          if (!parentNode || !parentNode.children) break;
          const anyOn = parentNode.children.some((c) => next[c.id]);
          if (!anyOn && !parentNode.forced) {
            next[parentId] = false;
          } else {
            break;
          }
        }
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const resetDefaults = useCallback(() => {
    const defaults = buildDefaults();
    setState(defaults);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ state, editMode, setEnabled, setEditMode, resetDefaults }),
    [state, editMode, setEnabled, resetDefaults],
  );

  return <FeaturesCtx.Provider value={value}>{children}</FeaturesCtx.Provider>;
};

export const useFeaturesCtx = (): Ctx => {
  const c = useContext(FeaturesCtx);
  if (!c) throw new Error("FeaturesProvider missing");
  return c;
};

export const useFeature = (id: string): boolean => {
  const { state } = useFeaturesCtx();
  return isVisible(state, id);
};

export const FeatureControl = ({ id }: { id: string }) => {
  const { state, editMode, setEnabled } = useFeaturesCtx();
  const node = NODE_BY_ID.get(id);
  if (!node || !editMode) return null;

  const enabled = state[id] ?? node.defaultOn;
  const family = familyOf(id);
  const depth = depthOf(id);
  const hue = FAMILY_HUE[family] ?? 220;
  const sizeClass =
    depth === 0
      ? "feature-toggle--big"
      : depth === 1
      ? "feature-toggle--mid"
      : "feature-toggle--small";

  return (
    <button
      type="button"
      className={`feature-toggle ${sizeClass} ${enabled ? "feature-toggle--on" : "feature-toggle--off"}`}
      style={{ "--family-hue": hue } as CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        if (node.forced) return;
        setEnabled(id, !enabled);
      }}
      title={
        node.forced
          ? `${node.label} (always on)`
          : `${node.label} — ${enabled ? "on" : "off"}`
      }
      disabled={node.forced}
    >
      <svg
        className="feature-toggle__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {enabled ? (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </>
        )}
      </svg>
      <span className="feature-toggle__label">{node.label}</span>
    </button>
  );
};

export const FeatureControlBar = ({ ids, className = "" }: { ids: string[]; className?: string }) => {
  const { editMode } = useFeaturesCtx();
  if (!editMode) return null;
  return (
    <div className={`feature-control-bar ${className}`}>
      {ids.map((id) => (
        <FeatureControl key={id} id={id} />
      ))}
    </div>
  );
};

export const Feature = ({
  id,
  children,
  as = "div",
  className = "",
}: {
  id: string;
  children: ReactNode;
  as?: "div" | "span";
  className?: string;
}) => {
  const { state, editMode } = useFeaturesCtx();
  const node = NODE_BY_ID.get(id);
  if (!node) return <>{children}</>;

  const enabled = state[id] ?? node.defaultOn;
  const visible = isVisible(state, id);

  if (!editMode) {
    if (!visible) return null;
    return <>{children}</>;
  }

  const Tag = as;
  const family = familyOf(id);
  const hue = FAMILY_HUE[family] ?? 220;
  const styleVars = { "--family-hue": hue } as CSSProperties;

  return (
    <Tag
      className={`feature-edit feature-edit--${as} ${enabled ? "feature-edit--on" : "feature-edit--off"} ${className}`}
      style={styleVars}
    >
      <FeatureControl id={id} />
      <Tag className="feature-edit__inner">{children}</Tag>
    </Tag>
  );
};

export const VisibilityButton = () => {
  const { editMode, setEditMode } = useFeaturesCtx();
  return (
    <button
      type="button"
      className={`edit-mode-button edit-mode-button--visibility${editMode ? " edit-mode-button--active" : ""}`}
      onClick={() => setEditMode(!editMode)}
      title={editMode ? "Exit visibility edit" : "Edit visible components"}
      aria-label="Edit visible components"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {editMode ? (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </>
        )}
      </svg>
    </button>
  );
};

const LIMIT_FIELDS: ReadonlyArray<{
  key: keyof Settings;
  label: string;
  hint?: string;
}> = [
  {
    key: "contextLimit",
    label: "Context limit",
    hint: "Denominator for context-fullness percentage.",
  },
  {
    key: "severityWarn",
    label: "Warn band threshold",
    hint: "Tokens at which a session enters the medium / yellow band.",
  },
  {
    key: "severityHigh",
    label: "High band threshold",
    hint: "Tokens at which a session enters the large / orange band.",
  },
  {
    key: "severityCrit",
    label: "Critical band threshold",
    hint: "Tokens at which a session enters the critical / red band.",
  },
  {
    key: "notifyThreshold",
    label: "Notify threshold",
    hint: "Server fires a macOS notification when a session crosses this. Server-side: also set NOTIFY_THRESHOLD env var to apply.",
  },
  {
    key: "scanIntervalMs",
    label: "Scan idle interval (ms)",
    hint: "Max client poll cadence when nothing is changing.",
  },
  {
    key: "statusPollMs",
    label: "Status poll interval (ms)",
    hint: "How often the dashboard checks status.claude.com.",
  },
];

const LimitField = ({
  fieldKey,
  label,
  hint,
}: {
  fieldKey: keyof Settings;
  label: string;
  hint?: string;
}) => {
  const { settings, setSetting } = useSettings();
  const [draft, setDraft] = useState<string>(String(settings[fieldKey]));
  useEffect(() => {
    setDraft(String(settings[fieldKey]));
  }, [settings, fieldKey]);
  const apply = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) {
      setSetting(fieldKey, n);
    } else {
      setDraft(String(settings[fieldKey]));
    }
  };
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <div className="settings-row__title">{label}</div>
        {hint && <div className="settings-row__hint">{hint}</div>}
      </div>
      <input
        type="number"
        className="settings-row__input"
        value={draft}
        min={1}
        step={1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
};

export const SettingsButton = ({
  tokenUsageContent,
}: {
  tokenUsageContent?: ReactNode;
}) => {
  const { resetDefaults } = useFeaturesCtx();
  const { reset: resetSettings } = useSettings();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="edit-mode-button edit-mode-button--settings"
        onClick={() => setOpen(true)}
        title="Settings"
        aria-label="Settings"
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setOpen(false)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__header">
                <h3 className="modal__title">Settings</h3>
                <button
                  type="button"
                  className="modal__close"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <h4 className="settings-section__title">Visibility</h4>
              <div className="settings-row">
                <div className="settings-row__label">
                  <div className="settings-row__title">
                    Reset visible components to default
                  </div>
                  <div className="settings-row__hint">
                    Clears your saved show/hide choices and restores the original layout.
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-row__action"
                  onClick={() => {
                    resetDefaults();
                    setOpen(false);
                  }}
                >
                  Reset
                </button>
              </div>

              {tokenUsageContent && (
                <>
                  <h4 className="settings-section__title">Token usage</h4>
                  {tokenUsageContent}
                </>
              )}

              <h4 className="settings-section__title">Limits & thresholds</h4>
              <p className="settings-section__hint">
                Stored in <code>localStorage</code>. Defaults: context limit 1,000,000;
                bands 50k / 150k / 300k. Server-side env vars (<code>CLAUDE_CONTEXT_LIMIT</code>,
                <code>NOTIFY_THRESHOLD</code>) still apply at server scope.
              </p>
              {LIMIT_FIELDS.map((f) => (
                <LimitField
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  hint={f.hint}
                />
              ))}
              <div className="settings-row">
                <div className="settings-row__label">
                  <div className="settings-row__title">
                    Reset limits & thresholds
                  </div>
                  <div className="settings-row__hint">
                    Restore default values for all numeric settings.
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-row__action"
                  onClick={() => resetSettings()}
                  title={`Defaults: ${JSON.stringify(DEFAULT_SETTINGS)}`}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
