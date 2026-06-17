export type AdapterId = "agents-md" | "codex" | "claude" | "cursor" | "windsurf" | "ollama" | "openai-compatible";

export type AdapterPreset = "ollama" | "lm-studio" | "llama-cpp" | "custom-openai-compatible";

export type LoopTemplateId = string;

export type TemplateCategory = "maintenance" | "delivery" | "quality" | "knowledge" | "cross-functional";

export type TemplateAudience = "developer" | "qa" | "product" | "ops" | "data" | "solutions";

export type TemplateDifficulty = "intro" | "standard" | "advanced";

export type ExperienceMode = "demo" | "project";

export interface CommandSet {
  install?: string;
  test?: string;
  lint?: string;
  build?: string;
  format?: string;
  packageManager?: string;
}

export interface ProjectScan {
  root: string;
  projectName: string;
  detectedAt: string;
  languages: string[];
  primaryLanguage: string;
  packageManagers: string[];
  commands: CommandSet;
  scripts: Record<string, string>;
  ci: {
    providers: string[];
    workflowFiles: string[];
  };
  files: {
    total: number;
    source: number;
    tests: number;
    configs: number;
  };
  contextSources: string[];
  warnings: string[];
}

export interface WizardAnswers {
  selectedTemplates: LoopTemplateId[];
  adapters: AdapterId[];
  adapterConfigs: AdapterConfigMap;
  triggerCadence: string;
  acceptanceCriteria: string;
  allowPrCreation: boolean;
  allowedCommands: string[];
  maxIterations: number;
}

export interface LoopSpec {
  id: LoopTemplateId;
  title: string;
  category: TemplateCategory;
  audience: TemplateAudience[];
  difficulty: TemplateDifficulty;
  expectedOutcome: string;
  goal: string;
  trigger: {
    type: string;
    cadence: string;
    sources: string[];
  };
  contextSources: string[];
  actions: string[];
  verification: {
    commands: string[];
    acceptanceCriteria: string;
    makerChecker: boolean;
    requiresHumanCommandDefinition: boolean;
  };
  stopCriteria: {
    maxIterations: number;
    timeoutMinutes: number;
    requireHumanInputOn: string[];
  };
  stateFile: string;
  permissions: {
    allowedCommands: string[];
    forbiddenPaths: string[];
    allowNetwork: boolean;
    allowPrCreation: boolean;
  };
  adapters: AdapterId[];
}

export interface TemplateDefinition {
  id: LoopTemplateId;
  title: string;
  summary: string;
  category: TemplateCategory;
  audience: TemplateAudience[];
  difficulty: TemplateDifficulty;
  expectedOutcome: string;
  demoAvailable: boolean;
  recommendedForDemo: boolean;
  recommended: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface AdapterDefinition {
  id: AdapterId;
  name: string;
  vendor: string;
  description: string;
  outputPath: string;
  files: string[];
  capabilities: string[];
  prBehavior: string;
  safetyNotes: string[];
  configurable: boolean;
}

export interface AdapterConfig {
  preset?: AdapterPreset;
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  warnings?: string[];
}

export type AdapterConfigMap = Partial<Record<AdapterId, AdapterConfig>>;

export interface GenerationOptions {
  projectRoot?: string;
  experienceMode?: ExperienceMode;
  selectedTemplates?: LoopTemplateId[];
  adapters?: AdapterId[];
  adapterConfigs?: AdapterConfigMap;
  audienceFilter?: TemplateAudience;
  categoryFilter?: TemplateCategory;
  triggerCadence?: string;
  acceptanceCriteria?: string;
  allowPrCreation?: boolean;
  allowedCommands?: string[];
  maxIterations?: number;
}

export interface GenerationResult {
  experienceMode: ExperienceMode;
  scan: ProjectScan;
  loops: LoopSpec[];
  files: GeneratedFile[];
  diff: string;
  warnings: string[];
}

// ---------- verified runner (`loopgen run`) ----------

export interface LoopFile {
  version: string;
  project: string;
  loops: LoopSpec[];
}

export interface CommandRunResult {
  command: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdoutExcerpt: string;
  stderrExcerpt: string;
}

export interface VerificationResult {
  passed: boolean;
  results: CommandRunResult[];
  warnings: string[];
}

export interface ForbiddenPathViolation {
  file: string;
  pattern: string;
}

export interface ForbiddenPathResult {
  ok: boolean;
  violations: ForbiddenPathViolation[];
}

export type RunMode = "referee" | "driven";

export interface AuditEntry {
  schemaVersion: "1";
  entryId: string;
  timestamp: string;
  project: string;
  loopId: string;
  mode: RunMode;
  actor: { user?: string; host?: string };
  git: { base: string; shaBefore: string | null; shaAfter: string | null; clean: boolean };
  changedFiles: { tracked: string[]; untracked: string[]; diffstat: string };
  forbidden: { ok: boolean; violations: ForbiddenPathViolation[] };
  verification: {
    passed: boolean;
    commands: Array<{ command: string; exitCode: number | null; timedOut: boolean; durationMs: number }>;
  };
  iterations: number;
  passed: boolean;
  driven?: {
    stopReason: DrivenStopReason;
    model: { adapter: string; modelName: string; baseUrl: string };
    attempts: IterationSummary[];
  };
  prevHash: string | null;
  hash: string;
}

export type AuditEntryInput = Omit<AuditEntry, "prevHash" | "hash">;

export interface RunOptions {
  projectRoot: string;
  loopId?: string;
  loopsFile?: string;
  mode?: RunMode;
  base?: string;
  dryRun?: boolean;
  writeReport?: boolean;
  // driven mode
  maxIterations?: number;
  allowDirty?: boolean;
  adapter?: "ollama" | "openai-compatible";
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  openaiCompatibleModel?: string;
  openaiCompatibleBaseUrl?: string;
  openaiCompatibleApiKeyEnv?: string;
  modelClient?: ModelClient; // dependency-injection seam for tests; never set by the CLI
}

export interface RunResult {
  loop: LoopSpec;
  passed: boolean;
  entry: AuditEntry;
  verification: VerificationResult;
  forbidden: ForbiddenPathResult;
  reportPath?: string;
  dryRun: boolean;
  iterationLogs?: IterationLog[];
}

// ---------- driven mode (`loopgen run --mode driven`) ----------

export type DrivenActionType = "write_file" | "delete_file" | "run_command" | "finish";

export interface WriteFileAction {
  type: "write_file";
  path: string;
  content: string;
}
export interface DeleteFileAction {
  type: "delete_file";
  path: string;
}
export interface RunCommandAction {
  type: "run_command";
  command: string;
}
export interface FinishAction {
  type: "finish";
  summary: string;
}
export type DrivenAction = WriteFileAction | DeleteFileAction | RunCommandAction | FinishAction;

export interface ModelTurn {
  reasoning: string;
  actions: DrivenAction[];
}

export type BlockReason = "forbidden-path" | "path-escape" | "command-not-allowed" | "limit-exceeded";

export interface BlockedAction {
  type: DrivenActionType;
  target: string;
  reason: BlockReason;
  pattern?: string;
}

export interface AppliedAction {
  type: DrivenActionType;
  target: string;
}

export type DrivenStopReason = "verified" | "finish" | "max-iterations" | "timeout" | "repeated-failure" | "forbidden-stop";

export interface IterationSummary {
  iteration: number;
  actions: { write: number; delete: number; run: number; finish: number };
  blocked: Array<{ type: DrivenActionType; reason: BlockReason; pattern?: string }>;
  verificationPassed: boolean;
  parseError?: string;
}

export interface IterationLog {
  iteration: number;
  reasoning: string;
  applied: AppliedAction[];
  blocked: BlockedAction[];
  parseError?: string;
  verification?: VerificationResult;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelClient {
  chat(messages: ChatMessage[]): Promise<string>;
}

export interface ModelClientConfig {
  adapterId: "ollama" | "openai-compatible";
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  timeoutMs: number;
}

// ---------- governance (`loopgen audit`) ----------

export interface GovernanceSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0..1
  byLoop: Record<string, { total: number; passed: number }>;
  byMode: { referee: number; driven: number };
  byActor: Record<string, { total: number; passed: number }>;
  blockedAttempts: number;
  forbiddenViolationRuns: number;
  firstAt?: string;
  lastAt?: string;
  chain: { valid: boolean; brokenAt?: number };
  sources: Array<{ label: string; entries: number; chainValid: boolean }>;
}

export interface AuditPolicy {
  requireLoops?: string[];
  since?: string;
  requireNoViolations?: boolean;
  requireChainValid?: boolean;
}

export interface PolicyResult {
  ok: boolean;
  failures: string[];
  checked: number;
}
