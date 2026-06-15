export type AdapterId = "codex" | "claude";

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

export interface GenerationOptions {
  projectRoot?: string;
  experienceMode?: ExperienceMode;
  selectedTemplates?: LoopTemplateId[];
  adapters?: AdapterId[];
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
