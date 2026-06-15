import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Code2,
  FileCode2,
  FlaskConical,
  FolderGit2,
  FolderOpen,
  GitPullRequestArrow,
  Hammer,
  History,
  Loader2,
  PackageOpen,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AdapterId,
  ExperienceMode,
  GenerationResult,
  LoopTemplateId,
  ProjectScan,
  TemplateAudience,
  TemplateCategory,
  TemplateDefinition
} from "../core/types.js";
import { TEMPLATE_AUDIENCES, TEMPLATE_CATEGORIES, TEMPLATE_DEFINITIONS } from "../core/templates.js";

const TEMPLATE_ICONS: Partial<Record<LoopTemplateId, typeof Hammer>> = {
  "ci-failure-repair": Hammer,
  "test-repair": FlaskConical,
  "dependency-upgrade": Upload,
  "pr-comment-handling": GitPullRequestArrow
};

const ADAPTERS: AdapterMeta[] = [
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    description: "Skills, automation prompts, checker TOML",
    outputPath: ".codex/",
    files: ["skills/*/SKILL.md", "automations/*.md", "agents/*-checker.toml"],
    capabilities: ["Automation prompt", "Project skill", "Checker agent"],
    prBehavior: "Can prepare a PR only when the loop allows PR creation.",
    safetyNotes: ["Dry-run through preview before files are applied.", "Forbidden paths are listed in each generated loop."]
  },
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    description: "Skills, loop guides, checker notes",
    outputPath: ".claude/",
    files: ["skills/*/SKILL.md", "loops/*.md", "agents/*-checker.md"],
    capabilities: ["Claude skill", "Loop guide", "Checker notes"],
    prBehavior: "Records PR handling guidance; it does not create PRs by default.",
    safetyNotes: ["Requires the user's local Claude Code setup.", "State files record attempts and blockers."]
  }
];

const DEFAULT_PATH = new URLSearchParams(window.location.search).get("project") ?? "";
const DEFAULT_MODE: ExperienceMode = DEFAULT_PATH ? "project" : "demo";
const DEMO_TEMPLATE_IDS = TEMPLATE_DEFINITIONS.filter((template) => template.demoAvailable && template.recommendedForDemo).map(
  (template) => template.id
);
const PROJECT_RECOMMENDED_TEMPLATE_IDS = TEMPLATE_DEFINITIONS.filter((template) => template.recommended).map((template) => template.id);

type CategoryFilter = TemplateCategory | "all";
type AudienceFilter = TemplateAudience | "all";

interface ChooseFolderResult {
  path?: string;
  canceled?: boolean;
  unsupported?: boolean;
  message?: string;
}

export function App() {
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(DEFAULT_MODE);
  const [projectPath, setProjectPath] = useState(DEFAULT_PATH);
  const [scan, setScan] = useState<ProjectScan | undefined>();
  const [selectedTemplates, setSelectedTemplates] = useState<LoopTemplateId[]>(
    DEFAULT_MODE === "demo" ? DEMO_TEMPLATE_IDS : PROJECT_RECOMMENDED_TEMPLATE_IDS
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");
  const [adapters, setAdapters] = useState<AdapterId[]>(["codex", "claude"]);
  const [expandedAdapters, setExpandedAdapters] = useState<AdapterId[]>([]);
  const [allowedCommands, setAllowedCommands] = useState("");
  const [triggerCadence, setTriggerCadence] = useState("manual");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(
    "All configured verification commands pass and the generated state file explains what changed."
  );
  const [allowPrCreation, setAllowPrCreation] = useState(false);
  const [preview, setPreview] = useState<GenerationResult | undefined>();
  const [status, setStatus] = useState<StatusState>({ kind: "idle", message: "Ready" });
  const [activeView, setActiveView] = useState<WorkspaceView>("configure");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    void runScan();
  }, [experienceMode]);

  useEffect(() => {
    if (scan && !allowedCommands) {
      setAllowedCommands(
        [scan.commands.install, scan.commands.test, scan.commands.lint, scan.commands.build, scan.commands.format]
          .filter(Boolean)
          .join("\n")
      );
    }
  }, [scan, allowedCommands]);

  const projectSummary = useMemo(() => {
    if (!scan) return [];
    return [
      ["Language", scan.primaryLanguage],
      ["Package manager", scan.packageManagers.join(", ") || "none"],
      ["Total files", String(scan.files.total)],
      ["Tests", String(scan.files.tests)],
      ["CI config", scan.ci.workflowFiles.join(", ") || "none"],
      ["Status", scan.warnings.length ? `${scan.warnings.length} warning(s)` : "Scan completed"]
    ];
  }, [scan]);

  const commandList = commandLines(allowedCommands);
  const warningCount = preview?.warnings.length ?? scan?.warnings.length ?? 0;
  const previewFileCount = preview?.files.length ?? 0;
  const playbookCount = preview?.files.filter((file) => file.path.startsWith(".loopgen/playbooks/")).length ?? 0;
  const visibleTemplates = useMemo(
    () =>
      TEMPLATE_DEFINITIONS.filter((template) => {
        const categoryMatches = categoryFilter === "all" || template.category === categoryFilter;
        const audienceMatches = audienceFilter === "all" || template.audience.includes(audienceFilter);
        return (categoryMatches && audienceMatches) || selectedTemplates.includes(template.id);
      }),
    [audienceFilter, categoryFilter, selectedTemplates]
  );
  const recommendedSelection = useMemo(
    () =>
      TEMPLATE_DEFINITIONS.filter((template) => {
        const categoryMatches = categoryFilter === "all" || template.category === categoryFilter;
        const audienceMatches = audienceFilter === "all" || template.audience.includes(audienceFilter);
        const matchesMode = experienceMode === "demo" ? template.demoAvailable && template.recommendedForDemo : template.recommended;
        return categoryMatches && audienceMatches && matchesMode;
      }).map((template) => template.id),
    [audienceFilter, categoryFilter, experienceMode]
  );
  const modeLabel = experienceMode === "demo" ? "Demo" : "Project";

  async function runScan(pathOverride?: string) {
    setStatus({ kind: "loading", message: experienceMode === "demo" ? "Loading demo" : "Scanning project" });
    setPreview(undefined);
    try {
      const params = new URLSearchParams({ experienceMode });
      const scanPath = pathOverride ?? projectPath;
      if (scanPath) params.set("path", scanPath);
      const result = await api<ProjectScan>(`/api/scan?${params.toString()}`);
      setScan(result);
      setProjectPath(result.root);
      setAllowedCommands(
        [result.commands.install, result.commands.test, result.commands.lint, result.commands.build, result.commands.format]
          .filter(Boolean)
          .join("\n")
      );
      setStatus({ kind: result.warnings.length ? "warning" : "success", message: experienceMode === "demo" ? "Demo ready" : "Project scan completed" });
      recordHistory(
        experienceMode === "demo" ? "Demo loaded" : "Project scan",
        `${result.projectName} scanned with ${result.files.total.toLocaleString()} file(s).`,
        result.warnings.length ? "warning" : "success"
      );
    } catch (error) {
      const message = errorMessage(error);
      setStatus({ kind: "error", message });
      recordHistory("Project scan failed", message, "error");
    }
  }

  async function chooseProjectFolder() {
    if (experienceMode === "demo") return;
    setStatus({ kind: "loading", message: "Opening folder picker" });
    setPreview(undefined);
    try {
      const result = await api<ChooseFolderResult>("/api/choose-folder", {});
      if (result.canceled) {
        setStatus({ kind: "idle", message: "Folder selection canceled" });
        recordHistory("Folder selection canceled", "No project path was changed.", "warning");
        return;
      }
      if (!result.path) {
        throw new Error(result.message ?? "Folder picker is not available on this system.");
      }
      setProjectPath(result.path);
      recordHistory("Folder selected", result.path, "success");
      await runScan(result.path);
    } catch (error) {
      const message = errorMessage(error);
      setStatus({ kind: "error", message });
      recordHistory("Folder selection failed", message, "error");
    }
  }

  async function generatePreview() {
    setStatus({ kind: "loading", message: "Generating preview" });
    try {
      const result = await api<GenerationResult>("/api/preview", {
        experienceMode,
        projectRoot: experienceMode === "project" ? projectPath : undefined,
        selectedTemplates,
        adapters,
        audienceFilter: audienceFilter === "all" ? undefined : audienceFilter,
        categoryFilter: categoryFilter === "all" ? undefined : categoryFilter,
        triggerCadence,
        acceptanceCriteria,
        allowPrCreation,
        allowedCommands: commandList,
        maxIterations: 3
      });
      setPreview(result);
      setStatus({ kind: result.warnings.length ? "warning" : "success", message: "Preview generated successfully" });
      recordHistory(
        "Preview generated",
        `${result.files.length} file(s), ${result.warnings.length} warning(s).`,
        result.warnings.length ? "warning" : "success"
      );
    } catch (error) {
      const message = errorMessage(error);
      setStatus({ kind: "error", message });
      recordHistory("Preview failed", message, "error");
    }
  }

  async function applyFiles() {
    if (!preview) return;
    if (experienceMode === "demo") {
      setStatus({ kind: "warning", message: "Demo mode is preview-only" });
      recordHistory("Apply skipped", "Switch to Use my project before writing generated files.", "warning");
      return;
    }
    const confirmed = window.confirm(`Write ${preview.files.length} loopgen files to this project?`);
    if (!confirmed) return;
    setStatus({ kind: "loading", message: "Applying files" });
    try {
      const result = await api<{ written: string[]; warnings: string[] }>("/api/apply", {
        experienceMode,
        projectRoot: projectPath,
        selectedTemplates,
        adapters,
        triggerCadence,
        acceptanceCriteria,
        allowPrCreation,
        allowedCommands: commandList,
        maxIterations: 3,
        confirm: true
      });
      setStatus({ kind: result.warnings.length ? "warning" : "success", message: `Wrote ${result.written.length} files` });
      recordHistory(
        "Files applied",
        `${result.written.length} file(s) written to the project.`,
        result.warnings.length ? "warning" : "success"
      );
    } catch (error) {
      const message = errorMessage(error);
      setStatus({ kind: "error", message });
      recordHistory("Apply failed", message, "error");
    }
  }

  function chooseExperienceMode(mode: ExperienceMode) {
    if (mode === "project" && experienceMode === "demo" && projectPath.includes("/examples/demo-webapp")) {
      setProjectPath(DEFAULT_PATH);
    }
    setExperienceMode(mode);
    setPreview(undefined);
    setSelectedTemplates(mode === "demo" ? DEMO_TEMPLATE_IDS : PROJECT_RECOMMENDED_TEMPLATE_IDS);
  }

  function selectRecommendedTemplates() {
    const nextSelection = recommendedSelection.length ? recommendedSelection : visibleTemplates.map((template) => template.id);
    setSelectedTemplates(nextSelection);
  }

  function toggleAdapterExpansion(id: AdapterId) {
    setExpandedAdapters((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function recordHistory(title: string, detail: string, kind: HistoryKind) {
    setHistoryItems((current) =>
      [
        {
          id: `${Date.now()}-${current.length}`,
          title,
          detail,
          kind,
          timestamp: new Date().toISOString()
        },
        ...current
      ].slice(0, 20)
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} strokeWidth={2.4} />
          </div>
          <strong>loopgen</strong>
        </div>

        <div className="project-card">
          <FolderGit2 size={17} />
          <div>
            <span>Project</span>
            <strong>{scan?.projectName ?? "Current project"}</strong>
          </div>
        </div>

        <nav className="side-nav" aria-label="Workspace">
          <button
            className={`side-nav-item ${activeView === "configure" ? "active" : ""}`}
            type="button"
            aria-current={activeView === "configure" ? "page" : undefined}
            onClick={() => setActiveView("configure")}
            data-testid="nav-configure"
          >
            <Code2 size={17} />
            Configure
          </button>
          <button
            className={`side-nav-item ${activeView === "history" ? "active" : ""}`}
            type="button"
            aria-current={activeView === "history" ? "page" : undefined}
            onClick={() => setActiveView("history")}
            data-testid="nav-history"
          >
            <History size={17} />
            History
          </button>
          <button
            className={`side-nav-item ${activeView === "settings" ? "active" : ""}`}
            type="button"
            aria-current={activeView === "settings" ? "page" : undefined}
            onClick={() => setActiveView("settings")}
            data-testid="nav-settings"
          >
            <Settings size={17} />
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="daemon-dot" />
          Local daemon active
        </div>
      </aside>

      <main className="workspace">
        {activeView === "configure" ? (
        <section className="content-grid">
          <div className="main-column">
            <section className="tool-panel experience-panel" aria-labelledby="experience-heading">
              <SectionTitle
                id="experience-heading"
                title="Experience"
                description="Choose whether to preview loop engineering with the built-in demo or generate files for a real project."
                count={modeLabel}
              />
              <div className="mode-grid">
                <ModeButton
                  icon={Sparkles}
                  title="Try demo"
                  description="Use the built-in demo project and preview loop outputs without writing files."
                  active={experienceMode === "demo"}
                  onClick={() => chooseExperienceMode("demo")}
                />
                <ModeButton
                  icon={FolderGit2}
                  title="Use my project"
                  description="Scan a local project, select scenarios, preview the diff, then apply generated files."
                  active={experienceMode === "project"}
                  onClick={() => chooseExperienceMode("project")}
                />
              </div>
            </section>

            <section className="tool-panel scan-panel" aria-labelledby="project-scan-heading">
              <div className="panel-kicker">{experienceMode === "demo" ? "Demo project" : "Project scan"}</div>
              <div className="scan-bar">
                <div>
                  <h1 id="project-scan-heading">{experienceMode === "demo" ? "Built-in demo" : "Project scan"}</h1>
                  <p>{scan ? `Scanned ${new Date(scan.detectedAt).toLocaleTimeString()}` : "Scan before generating loops."}</p>
                </div>
                <StatusPill status={status} />
              </div>
              <div className="path-row">
                <label>
                  {experienceMode === "demo" ? "Demo fixture path" : "Project path"}
                  <input
                    aria-label="Project path"
                    value={projectPath}
                    placeholder="Current working directory"
                    disabled={experienceMode === "demo"}
                    onChange={(event) => setProjectPath(event.target.value)}
                  />
                </label>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={chooseProjectFolder}
                  disabled={experienceMode === "demo" || status.kind === "loading"}
                  data-testid="choose-folder"
                  title={experienceMode === "demo" ? "Switch to Use my project to choose a folder" : "Choose a local project folder"}
                >
                  <FolderOpen size={16} />
                  Choose folder
                </button>
                <button className="secondary-button compact-button" type="button" onClick={() => runScan()}>
                  {status.kind === "loading" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                  {experienceMode === "demo" ? "Reload demo" : "Scan project"}
                </button>
              </div>
              <div className="scan-layout">
                <dl className="scan-table">
                  {projectSummary.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="metrics-list" aria-label="Project summary">
                  <Metric icon={FileCode2} label="Source files" value={scan?.files.source ?? 0} />
                  <Metric icon={FlaskConical} label="Test files" value={scan?.files.tests ?? 0} />
                  <Metric icon={Settings} label="Config files" value={scan?.files.configs ?? 0} />
                  <Metric icon={PackageOpen} label="Scripts" value={scan ? Object.keys(scan.scripts).length : 0} />
                </div>
              </div>
            </section>

            <section className="tool-panel" aria-labelledby="scenario-templates-heading">
              <SectionTitle
                id="scenario-templates-heading"
                title="Scenario templates"
                description="Filter by role or category, then select the loop playbooks and agent configs to generate."
                count={`${selectedTemplates.length}/${TEMPLATE_DEFINITIONS.length}`}
              />
              <div className="filter-row">
                <label>
                  Category
                  <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}>
                    <option value="all">All categories</option>
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Audience
                  <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value as AudienceFilter)}>
                    <option value="all">All audiences</option>
                    {TEMPLATE_AUDIENCES.map((audience) => (
                      <option key={audience.id} value={audience.id}>
                        {audience.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button compact-button" type="button" onClick={selectRecommendedTemplates}>
                  <ShieldCheck size={16} />
                  Use recommended
                </button>
              </div>
              {visibleTemplates.length ? (
                <div className="template-list">
                  {visibleTemplates.map((template) => (
                  <TemplateRow
                    key={template.id}
                    template={template}
                    checked={selectedTemplates.includes(template.id)}
                    onChange={(checked) => toggleTemplate(template.id, checked, setSelectedTemplates)}
                  />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">
                  <FileCode2 size={23} />
                  <strong>No templates match</strong>
                  <span>Change the filters or use the recommended set.</span>
                </div>
              )}
            </section>

            <section className="tool-panel" aria-labelledby="adapters-heading">
              <SectionTitle
                id="adapters-heading"
                title="Adapters"
                description="Choose which agent configuration files loopgen should emit."
                count={`${adapters.length}/${ADAPTERS.length}`}
              />
              <div className="adapter-list">
                {ADAPTERS.map((adapter) => (
                  <AdapterRow
                    key={adapter.id}
                    adapter={adapter}
                    checked={adapters.includes(adapter.id)}
                    expanded={expandedAdapters.includes(adapter.id)}
                    allowPrCreation={allowPrCreation}
                    onCheckedChange={(checked) => toggleAdapter(adapter.id, checked, setAdapters)}
                    onToggle={() => toggleAdapterExpansion(adapter.id)}
                  />
                ))}
              </div>
            </section>

            <section className="tool-panel" aria-labelledby="loop-behavior-heading">
              <SectionTitle
                id="loop-behavior-heading"
                title="Loop behavior"
                description="Set trigger cadence, command guardrails, and acceptance criteria."
              />
              <div className="behavior-grid">
                <label>
                  Cadence
                  <select value={triggerCadence} onChange={(event) => setTriggerCadence(event.target.value)}>
                    <option value="manual">Manual</option>
                    <option value="on_ci_failure">On CI failure</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <div className="command-chips" aria-label="Allowed commands">
                  <span>Allowed commands</span>
                  <div>
                    {commandList.length ? commandList.map((command) => <code key={command}>{command}</code>) : <em>No commands inferred</em>}
                  </div>
                </div>
                <label className="wide-field">
                  Edit allowed commands
                  <textarea
                    value={allowedCommands}
                    rows={4}
                    onChange={(event) => setAllowedCommands(event.target.value)}
                  />
                </label>
                <label className="wide-field">
                  Acceptance criteria
                  <textarea
                    value={acceptanceCriteria}
                    rows={3}
                    onChange={(event) => setAcceptanceCriteria(event.target.value)}
                  />
                </label>
                <label className="check-line wide-field">
                  <input
                    type="checkbox"
                    checked={allowPrCreation}
                    onChange={(event) => setAllowPrCreation(event.target.checked)}
                  />
                  Allow verified loops to prepare PRs
                </label>
              </div>
            </section>
          </div>

          <aside className="preview-panel" aria-label="Preview diff">
            <div className="preview-header">
              <div>
                <div className="panel-kicker">Preview diff</div>
                <h2>Preview diff</h2>
                <p>
                  {preview
                    ? `${modeLabel} preview generated from current selections.`
                    : experienceMode === "demo"
                      ? "Generate a demo preview to inspect loop engineering outputs."
                      : "Generate a preview before writing files."}
                </p>
              </div>
              <ShieldCheck size={21} />
            </div>
            <div className="preview-stats" aria-label="Preview status">
              <span>
                <strong>{previewFileCount}</strong>
                files
              </span>
              <span>
                <strong>{playbookCount}</strong>
                playbooks
              </span>
              <span className={warningCount > 0 ? "warn-stat" : ""}>
                <strong>{warningCount}</strong>
                warnings
              </span>
            </div>
            <DiffView diff={preview?.diff ?? ""} />
            <div className="preview-footer">
              <StatusSummary status={status} warnings={preview?.warnings ?? scan?.warnings ?? []} />
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={applyFiles}
                  disabled={!preview || status.kind === "loading" || experienceMode === "demo"}
                  data-testid="apply-files"
                  title={experienceMode === "demo" ? "Demo mode is preview-only" : preview ? "Apply generated files" : "Generate preview first"}
                >
                  <Check size={17} />
                  {experienceMode === "demo" ? "Preview only" : "Apply files"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={generatePreview}
                  disabled={selectedTemplates.length === 0 || adapters.length === 0 || status.kind === "loading"}
                  data-testid="generate-preview"
                >
                  {status.kind === "loading" ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
                  Generate preview
                </button>
              </div>
            </div>
          </aside>
        </section>
        ) : activeView === "history" ? (
          <HistoryView items={historyItems} scan={scan} preview={preview} />
        ) : (
          <SettingsView
            experienceMode={experienceMode}
            projectPath={projectPath}
            onProjectPathChange={setProjectPath}
            onChooseProjectFolder={chooseProjectFolder}
            onScan={() => runScan()}
            status={status}
            triggerCadence={triggerCadence}
            onTriggerCadenceChange={setTriggerCadence}
            allowedCommands={allowedCommands}
            onAllowedCommandsChange={setAllowedCommands}
            acceptanceCriteria={acceptanceCriteria}
            onAcceptanceCriteriaChange={setAcceptanceCriteria}
            allowPrCreation={allowPrCreation}
            onAllowPrCreationChange={setAllowPrCreation}
            adapters={adapters}
          />
        )}
      </main>
    </div>
  );
}

type WorkspaceView = "configure" | "history" | "settings";
type HistoryKind = Exclude<StatusState["kind"], "idle" | "loading">;

interface HistoryItem {
  id: string;
  title: string;
  detail: string;
  kind: HistoryKind;
  timestamp: string;
}

interface StatusState {
  kind: "idle" | "loading" | "success" | "warning" | "error";
  message: string;
}

interface AdapterMeta {
  id: AdapterId;
  name: string;
  vendor: string;
  description: string;
  outputPath: string;
  files: string[];
  capabilities: string[];
  prBehavior: string;
  safetyNotes: string[];
}

function HistoryView({
  items,
  scan,
  preview
}: {
  items: HistoryItem[];
  scan: ProjectScan | undefined;
  preview: GenerationResult | undefined;
}) {
  return (
    <section className="workspace-page" aria-labelledby="history-heading">
      <div className="view-header">
        <div>
          <div className="panel-kicker">History</div>
          <h1 id="history-heading">History</h1>
          <p>Recent scan, preview, and apply events from this local session.</p>
        </div>
        <History size={24} />
      </div>

      <div className="summary-grid" aria-label="History summary">
        <SummaryCard label="Last scan" value={scan ? new Date(scan.detectedAt).toLocaleTimeString() : "Not run"} />
        <SummaryCard label="Preview files" value={String(preview?.files.length ?? 0)} />
        <SummaryCard label="Warnings" value={String(preview?.warnings.length ?? scan?.warnings.length ?? 0)} />
      </div>

      <section className="tool-panel" aria-labelledby="recent-activity-heading">
        <SectionTitle
          id="recent-activity-heading"
          title="Recent activity"
          description="This history stays local to the current wizard session."
          count={String(items.length)}
        />
        {items.length ? (
          <ol className="history-list">
            {items.map((item) => (
              <li className={`history-entry ${item.kind}`} key={item.id}>
                <span className="history-dot" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleTimeString()}</time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            <History size={23} />
            <strong>No activity yet</strong>
            <span>Run a scan or generate a preview to populate this view.</span>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsView({
  experienceMode,
  projectPath,
  onProjectPathChange,
  onChooseProjectFolder,
  onScan,
  status,
  triggerCadence,
  onTriggerCadenceChange,
  allowedCommands,
  onAllowedCommandsChange,
  acceptanceCriteria,
  onAcceptanceCriteriaChange,
  allowPrCreation,
  onAllowPrCreationChange,
  adapters
}: {
  experienceMode: ExperienceMode;
  projectPath: string;
  onProjectPathChange: (value: string) => void;
  onChooseProjectFolder: () => void;
  onScan: () => void;
  status: StatusState;
  triggerCadence: string;
  onTriggerCadenceChange: (value: string) => void;
  allowedCommands: string;
  onAllowedCommandsChange: (value: string) => void;
  acceptanceCriteria: string;
  onAcceptanceCriteriaChange: (value: string) => void;
  allowPrCreation: boolean;
  onAllowPrCreationChange: (checked: boolean) => void;
  adapters: AdapterId[];
}) {
  const commands = commandLines(allowedCommands);
  const selectedAdapters = ADAPTERS.filter((adapter) => adapters.includes(adapter.id));

  return (
    <section className="workspace-page settings-page" aria-labelledby="settings-heading">
      <div className="view-header">
        <div>
          <div className="panel-kicker">Settings</div>
          <h1 id="settings-heading">Settings</h1>
          <p>Workspace defaults used by scan and preview generation.</p>
        </div>
        <Settings size={24} />
      </div>

      <section className="tool-panel" aria-labelledby="workspace-settings-heading">
        <SectionTitle
          id="workspace-settings-heading"
          title="Workspace"
          description={experienceMode === "demo" ? "Demo mode uses the built-in fixture and stays preview-only." : "Set the project root used by loopgen's local scanner."}
        />
        <div className="settings-grid">
          <label className="wide-field">
            Project path
            <input
              aria-label="Settings project path"
              value={projectPath}
              placeholder="Current working directory"
              disabled={experienceMode === "demo"}
              onChange={(event) => onProjectPathChange(event.target.value)}
            />
          </label>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={onChooseProjectFolder}
            disabled={experienceMode === "demo" || status.kind === "loading"}
            title={experienceMode === "demo" ? "Switch to Use my project to choose a folder" : "Choose a local project folder"}
          >
            <FolderOpen size={16} />
            Choose folder
          </button>
          <button className="secondary-button compact-button" type="button" onClick={onScan} disabled={status.kind === "loading"}>
            {status.kind === "loading" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            Scan project
          </button>
          <StatusPill status={status} />
        </div>
      </section>

      <section className="tool-panel" aria-labelledby="loop-defaults-heading">
        <SectionTitle
          id="loop-defaults-heading"
          title="Loop defaults"
          description="Tune the behavior shared by generated loop configurations."
        />
        <div className="behavior-grid">
          <label>
            Cadence
            <select value={triggerCadence} onChange={(event) => onTriggerCadenceChange(event.target.value)}>
              <option value="manual">Manual</option>
              <option value="on_ci_failure">On CI failure</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <div className="command-chips" aria-label="Settings allowed commands">
            <span>Allowed commands</span>
            <div>{commands.length ? commands.map((command) => <code key={command}>{command}</code>) : <em>No commands inferred</em>}</div>
          </div>
          <label className="wide-field">
            Edit allowed commands
            <textarea value={allowedCommands} rows={4} onChange={(event) => onAllowedCommandsChange(event.target.value)} />
          </label>
          <label className="wide-field">
            Acceptance criteria
            <textarea value={acceptanceCriteria} rows={3} onChange={(event) => onAcceptanceCriteriaChange(event.target.value)} />
          </label>
          <label className="check-line wide-field">
            <input
              type="checkbox"
              checked={allowPrCreation}
              onChange={(event) => onAllowPrCreationChange(event.target.checked)}
            />
            Allow verified loops to prepare PRs
          </label>
        </div>
      </section>

      <section className="tool-panel" aria-labelledby="adapter-settings-heading">
        <SectionTitle
          id="adapter-settings-heading"
          title="Adapter outputs"
          description="Selected adapters are configured on the Configure page."
          count={`${selectedAdapters.length}/${ADAPTERS.length}`}
        />
        <div className="settings-adapter-list">
          {selectedAdapters.map((adapter) => (
            <div className="settings-adapter" key={adapter.id}>
              <Bot size={18} />
              <div>
                <strong>{adapter.name}</strong>
                <span>{adapter.outputPath}</span>
              </div>
              <code>{adapter.files.length} file groups</code>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ModeButton({
  icon: Icon,
  title,
  description,
  active,
  onClick
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`mode-button ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <Icon size={20} />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="mode-check">{active ? <Check size={15} /> : null}</span>
    </button>
  );
}

function SectionTitle({
  id,
  title,
  description,
  count
}: {
  id: string;
  title: string;
  description: string;
  count?: string;
}) {
  return (
    <div className="section-title">
      <div>
        <div className="panel-kicker">{title}</div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {count ? <span className="count-badge">{count}</span> : null}
    </div>
  );
}

function StatusPill({ status }: { status: StatusState }) {
  return (
    <div className={`status-pill ${status.kind}`}>
      {status.kind === "loading" ? <Loader2 size={15} className="spin" /> : status.kind === "error" ? <AlertCircle size={15} /> : <Check size={15} />}
      {status.message}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof FileCode2; label: string; value: number }) {
  return (
    <div className="metric">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function TemplateRow({
  template,
  checked,
  onChange
}: {
  template: TemplateDefinition;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const Icon = iconForTemplate(template);
  const categoryLabel = categoryLabelFor(template.category);
  const audienceLabels = template.audience.map(audienceLabelFor).join(", ");
  const recommendationLabel = template.recommendedForDemo ? "Demo ready" : template.recommended ? "Recommended" : "Optional";
  return (
    <label className={`template-row ${checked ? "selected" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox-mark">{checked ? <Check size={15} /> : null}</span>
      <Icon size={20} />
      <span className="template-copy">
        <span className="template-title-line">
          <strong>{template.title}</strong>
          <small>{difficultyLabelFor(template.difficulty)}</small>
        </span>
        <small>{template.summary}</small>
        <span className="template-meta">
          <small>{categoryLabel}</small>
          <small>{audienceLabels}</small>
        </span>
        <small className="template-outcome">{template.expectedOutcome}</small>
      </span>
      <span className={template.recommended || template.recommendedForDemo ? "recommend recommended" : "recommend optional"}>
        {recommendationLabel}
      </span>
    </label>
  );
}

function iconForTemplate(template: TemplateDefinition) {
  if (TEMPLATE_ICONS[template.id]) return TEMPLATE_ICONS[template.id]!;
  if (template.category === "maintenance") return Hammer;
  if (template.category === "delivery") return Upload;
  if (template.category === "quality") return ShieldCheck;
  if (template.category === "knowledge") return FileCode2;
  return GitPullRequestArrow;
}

function categoryLabelFor(category: TemplateCategory) {
  return TEMPLATE_CATEGORIES.find((item) => item.id === category)?.label ?? category;
}

function audienceLabelFor(audience: TemplateAudience) {
  return TEMPLATE_AUDIENCES.find((item) => item.id === audience)?.label ?? audience;
}

function difficultyLabelFor(difficulty: TemplateDefinition["difficulty"]) {
  if (difficulty === "intro") return "Intro";
  if (difficulty === "advanced") return "Advanced";
  return "Standard";
}

function AdapterRow({
  adapter,
  checked,
  expanded,
  allowPrCreation,
  onCheckedChange,
  onToggle
}: {
  adapter: AdapterMeta;
  checked: boolean;
  expanded: boolean;
  allowPrCreation: boolean;
  onCheckedChange: (checked: boolean) => void;
  onToggle: () => void;
}) {
  const panelId = `adapter-panel-${adapter.id}`;
  return (
    <div className={`adapter-card ${expanded ? "expanded" : ""} ${checked ? "selected" : ""}`}>
      <div className="adapter-row">
        <label className="adapter-checkbox" aria-label={`${adapter.name} enabled`}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
            data-testid={`adapter-checkbox-${adapter.id}`}
          />
          <span className="checkbox-mark">{checked ? <Check size={15} /> : null}</span>
        </label>
        <button
          className="adapter-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          data-testid={`adapter-toggle-${adapter.id}`}
        >
          <Bot size={20} />
          <span className="adapter-copy">
            <span>
              <strong>{adapter.name}</strong>
              <em>{adapter.vendor}</em>
            </span>
            <small>{adapter.description}</small>
          </span>
          <ChevronDown className="adapter-chevron" size={18} />
        </button>
      </div>
      <div className="adapter-panel" id={panelId} data-testid={`adapter-panel-${adapter.id}`} hidden={!expanded}>
        <div className="adapter-detail-grid">
          <DetailItem label="Output path" value={adapter.outputPath} code />
          <DetailItem label="Checker" value="Enabled" tone="success" />
          <DetailItem label="PR behavior" value={allowPrCreation ? "Allowed after verification" : adapter.prBehavior} />
          <div className="detail-item wide">
            <span>Generated files</span>
            <div className="file-chip-row">
              {adapter.files.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          </div>
          <div className="detail-item wide">
            <span>Capabilities</span>
            <div className="file-chip-row">
              {adapter.capabilities.map((capability) => (
                <small key={capability}>{capability}</small>
              ))}
            </div>
          </div>
          <div className="detail-item wide safety-note">
            <span>Safety notes</span>
            <ul>
              {adapter.safetyNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  code,
  tone
}: {
  label: string;
  value: string;
  code?: boolean;
  tone?: "success";
}) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      {code ? <code>{value}</code> : <strong className={tone === "success" ? "success-text" : undefined}>{value}</strong>}
    </div>
  );
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff ? diff.split("\n").slice(0, 260) : [];
  if (lines.length === 0) {
    return (
      <div className="empty-diff">
        <FileCode2 size={24} />
        <strong>No preview yet</strong>
        <span>Run Generate preview to see generated files and safety warnings.</span>
      </div>
    );
  }

  return (
    <pre className="diff-view">
      {lines.map((line, index) => (
        <code key={`${line}-${index}`} className={lineClass(line)}>
          {line}
        </code>
      ))}
    </pre>
  );
}

function StatusSummary({ status, warnings }: { status: StatusState; warnings: string[] }) {
  return (
    <div className={`status-summary ${status.kind}`}>
      {status.kind === "error" ? <AlertCircle size={19} /> : <Check size={19} />}
      <div>
        <strong>{status.message}</strong>
        <span>{warnings.length ? warnings[0] : "No errors detected"}</span>
      </div>
    </div>
  );
}

function lineClass(line: string) {
  if (line.startsWith("+++")) return "diff-meta";
  if (line.startsWith("---")) return "diff-meta";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-remove";
  return "diff-context";
}

function toggleTemplate(
  id: LoopTemplateId,
  checked: boolean,
  setter: (updater: (current: LoopTemplateId[]) => LoopTemplateId[]) => void
) {
  setter((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
}

function toggleAdapter(id: AdapterId, checked: boolean, setter: (updater: (current: AdapterId[]) => AdapterId[]) => void) {
  setter((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
}

function commandLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function api<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
