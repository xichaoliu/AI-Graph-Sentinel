export type Phase = "idle" | "uploading" | "waiting" | "analyzing" | "done" | "error";
export type LogKind = "agent" | "warn" | "wait" | "human";

export interface GraphNode {
  id: string;
  name: string;
  category: string; // 后端返回的实体分类，confirm 时原样回传
  cat: number; // 对应 CATS 的下标
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  flagged?: boolean;
}

export interface LogItem {
  text: string;
  kind: LogKind;
  t: string;
}
