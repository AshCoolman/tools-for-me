import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export const FeatureControlBar = (_props: { ids: string[]; className?: string }) => {
  return null;
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
      data-feature-id={id}
      className={`feature-edit feature-edit--${as} ${enabled ? "feature-edit--on" : "feature-edit--off"} ${className}`}
      style={styleVars}
    >
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
        viewBox="0 0 14 14"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {editMode ? (
          <>
            <path d="M1 7s2.5-4.5 6-4.5S13 7 13 7s-2.5 4.5-6 4.5S1 7 1 7z" />
            <circle cx="7" cy="7" r="1.75" />
          </>
        ) : (
          <>
            <path d="M5.45 5.45a1.75 1.75 0 1 0 2.47 2.47" />
            <path d="M6.1 2.77A5.5 5.5 0 0 1 7 2.5c3.5 0 6 4.5 6 4.5a10 10 0 0 1-.97 1.56" />
            <path d="M3.86 3.86A10 10 0 0 0 1 7s2.5 4.5 6 4.5a5.7 5.7 0 0 0 3.14-.86" />
            <line x1="1" y1="1" x2="13" y2="13" />
          </>
        )}
      </svg>
    </button>
  );
};

const SidebarNode = ({
  node,
  depth,
}: {
  node: FeatureNode;
  depth: number;
}) => {
  const { state, setEnabled } = useFeaturesCtx();
  const enabled = state[node.id] ?? node.defaultOn;
  const family = familyOf(node.id);
  const hue = FAMILY_HUE[family] ?? 220;

  return (
    <>
      <button
        type="button"
        data-sidebar-id={node.id}
        className={`vis-sidebar__item ${enabled ? "vis-sidebar__item--on" : "vis-sidebar__item--off"}`}
        style={
          {
            "--family-hue": hue,
            paddingLeft: 12 + depth * 14,
          } as CSSProperties
        }
        onClick={() => !node.forced && setEnabled(node.id, !enabled)}
        disabled={node.forced}
      >
        <span className="vis-sidebar__eye" aria-hidden>
          {enabled ? "●" : "○"}
        </span>
        <span className="vis-sidebar__label">{node.label}</span>
      </button>
      {node.children?.map((child) => (
        <SidebarNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
};

const useConnectorLines = (
  editMode: boolean,
  svgRef: React.RefObject<SVGSVGElement | null>,
  state: FeaturesState,
) => {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !editMode) return;

    let rafId: number;
    const NS = "http://www.w3.org/2000/svg";

    const update = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      for (const node of FLAT) {
        const sidebarEl = document.querySelector(
          `[data-sidebar-id="${node.id}"]`,
        );
        const featureEl = document.querySelector(
          `[data-feature-id="${node.id}"]`,
        );
        if (!sidebarEl || !featureEl) continue;

        const sRect = sidebarEl.getBoundingClientRect();
        const fRect = featureEl.getBoundingClientRect();

        if (fRect.bottom < 0 || fRect.top > window.innerHeight) continue;
        if (sRect.bottom < 0 || sRect.top > window.innerHeight) continue;

        const hue = FAMILY_HUE[familyOf(node.id)] ?? 220;
        const color = `hsl(${hue}, 70%, 55%)`;

        const sx = sRect.left;
        const sy = sRect.top + sRect.height / 2;
        const ex = fRect.right + 4;
        const ey = Math.max(0, Math.min(window.innerHeight, fRect.top + fRect.height / 2));

        const dx = (sx - ex) * 0.4;
        const d = `M${sx},${sy} C${sx - dx},${sy} ${ex + dx},${ey} ${ex},${ey}`;

        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", "1");
        path.setAttribute("stroke-opacity", "0.45");
        svg.appendChild(path);
      }

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [editMode, svgRef, state]);
};

export const VisibilitySidebar = () => {
  const { state, editMode, resetDefaults } = useFeaturesCtx();
  const svgRef = useRef<SVGSVGElement | null>(null);
  useConnectorLines(editMode, svgRef, state);

  if (!editMode) return null;

  return createPortal(
    <>
      <svg
        ref={svgRef}
        className="vis-lines"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 49,
        }}
      />
      <div className="vis-sidebar">
        <div className="vis-sidebar__header">Visibility</div>
        <div className="vis-sidebar__list">
          {FEATURE_TREE.map((node) => (
            <SidebarNode key={node.id} node={node} depth={0} />
          ))}
        </div>
        <button
          type="button"
          className="vis-sidebar__reset"
          onClick={resetDefaults}
        >
          Reset defaults
        </button>
      </div>
    </>,
    document.body,
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
          viewBox="0 0 14 14"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="2" />
          <path d="M7 1v1.5M7 11.5V13M2.05 2.05l1.06 1.06M10.89 10.89l1.06 1.06M1 7h1.5M11.5 7H13M2.05 11.95l1.06-1.06M10.89 3.11l1.06-1.06" />
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
