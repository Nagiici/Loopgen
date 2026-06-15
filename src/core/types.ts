export type AdapterId = "codex" | "claude";

export type LoopTemplateId =
  | "ci-failure-repair"
  | "test-repair"
  | "dependency-upgrade"
  | "pr-comment-handling";

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
  triggerCadence: string;
  acceptanceCriteria: string;
  allowPrCreation: boolean;
  allowedCommands: string[];
  maxIterations: number;
}

export interface LoopSpec {
  id: LoopTemplateId;
  title: string;
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
  recommended: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerationOptions {
  projectRoot: string;
  selectedTemplates?: LoopTemplateId[];
  adapters?: AdapterId[];
  triggerCadence?: string;
  acceptanceCriteria?: string;
  allowPrCreation?: boolean;
  allowedCommands?: string[];
  maxIterations?: number;
}

export interface GenerationResult {
  scan: ProjectScan;
  loops: LoopSpec[];
  files: GeneratedFile[];
  diff: string;
  warnings: string[];
}
