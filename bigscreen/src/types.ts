export type Phase = "idle" | "running" | "waiting" | "done";
export type LogKind = "agent" | "warn" | "wait" | "human";

export interface GraphNode {
  id: string;
  cat: number; // 对应 CATS 的下标
  size: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  conflict?: boolean; // 假数据里标记"幻觉边"
  flagged?: boolean; // Validator 标红
}

export interface LogItem {
  text: string;
  kind: LogKind;
  t: string;
}

export interface Step {
  stage: number;
  log: string;
  nodes?: number;
  edges?: number;
  flag?: boolean;
  wait?: boolean;
  report?: boolean;
}
