import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import "./App.css";
import type { GraphEdge, GraphNode, LogItem, LogKind, Phase } from "./types";

const STAGES = ["Supervisor", "Extractor", "Validator", "HITL", "Analyst"] as const;
const CATS = [
  { name: "公司", color: "#00e5ff" },
  { name: "人物", color: "#b388ff" },
  { name: "金融机构", color: "#ffd740" },
  { name: "合同", color: "#69f0ae" },
];

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = "3MB";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "待上传",
  uploading: "解析中",
  waiting: "待审核",
  analyzing: "生成中",
  done: "已完成",
  error: "失败",
};

const NODE_DONE_LABEL: Record<string, string> = {
  supervisor: "Supervisor 完成调度",
  parser: "Parser 解析文档完成",
  extractor: "Extractor 抽取实体与关系完成",
  validator: "Validator 审查完成",
};

const NEXT_STEP_STATUS: Record<string, { stage: number; text: string }> = {
  parser: { stage: 0, text: "调度 Parser 解析文档…" },
  extractor: { stage: 1, text: "调度 Extractor 抽取实体与关系…" },
  validator: { stage: 2, text: "调度 Validator 校验图谱…" },
  analyst: { stage: 4, text: "调度 Analyst 生成报告…" },
  end: { stage: 4, text: "流程执行完成" },
};

type GraphResult = { nodes: GraphNode[]; edges: GraphEdge[] };
type SSEHandler = (event: string, data: unknown) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function readText(data: unknown): string {
  if (typeof data === "string") return data;
  if (isRecord(data) && typeof data.text === "string") return data.text;
  return "";
}

function readReport(data: unknown): string {
  if (isRecord(data) && typeof data.report === "string") return data.report;
  return "";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function validateFile(file: File): string | null {
  const isPdfName = file.name.toLowerCase().endsWith(".pdf");
  const isPdfType =
    !file.type || file.type === "application/pdf" || file.type === "application/octet-stream";
  if (!isPdfName || !isPdfType) return "仅支持 PDF 格式";
  if (file.size === 0) return "文件为空，请重新选择";
  if (file.size > MAX_FILE_SIZE) {
    return `文件大小 ${formatBytes(file.size)}，不能超过 ${MAX_FILE_SIZE_LABEL}`;
  }
  return null;
}

function categoryIndex(category: string): number {
  if (/人物|人员|自然人|股东|法人|实控|高管|董事/.test(category)) return 1;
  if (/银行|金融|信托|证券|基金|保险|机构/.test(category)) return 2;
  if (/合同|协议|文件|条款|凭证|发票/.test(category)) return 3;
  return 0;
}

function normalizeGraph(rawNodes: unknown, rawEdges: unknown): GraphResult {
  const nodeList: unknown[] = Array.isArray(rawNodes) ? rawNodes : [];
  const edgeList: unknown[] = Array.isArray(rawEdges) ? rawEdges : [];
  const nodeMap = new Map<string, GraphNode>();

  for (const item of nodeList) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    if (!id) continue;
    const name = asString(item.name) || id;
    const category = asString(item.category) || "未知";
    nodeMap.set(id, { id, name, category, cat: categoryIndex(category) });
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const item of edgeList) {
    if (!isRecord(item)) continue;
    const source = asString(item.source);
    const target = asString(item.target);
    if (!source || !target) continue;
    const label = asString(item.relation) || "关联";
    const id = `${source}->${target}:${label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!nodeMap.has(source)) {
      nodeMap.set(source, { id: source, name: source, category: "未知", cat: 0 });
    }
    if (!nodeMap.has(target)) {
      nodeMap.set(target, { id: target, name: target, category: "未知", cat: 0 });
    }
    edges.push({ id, source, target, label });
  }

  return { nodes: [...nodeMap.values()], edges };
}

async function streamSSE(
  url: string,
  init: RequestInit,
  onEvent: SSEHandler,
  signal: AbortSignal,
): Promise<void> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "text/event-stream");

  const res = await fetch(url, { ...init, headers, signal, cache: "no-store" });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && typeof parsed.detail === "string") message = parsed.detail;
      else if (isRecord(parsed) && typeof parsed.message === "string") message = parsed.message;
    } catch {
      // 非 JSON 响应保留原文
    }
    throw new Error(message || `请求失败（HTTP ${res.status}）`);
  }
  if (!res.body) throw new Error("当前浏览器不支持流式响应");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (block: string) => {
    const raw = block.trim();
    if (!raw) return;

    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
    }
    if (dataLines.length === 0) return;

    let data: unknown = dataLines.join("\n");
    try {
      data = JSON.parse(data as string);
    } catch {
      // data 不是 JSON 时按原始文本处理
    }
    onEvent(event, data);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) dispatch(block);
  }

  buffer += decoder.decode();
  dispatch(buffer);
}

function UploadIcon({ size = 42 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function reportPlaceholder(phase: Phase): string {
  if (phase === "uploading") return "文档解析与图谱抽取进行中…";
  if (phase === "waiting") return "等待人工审核，确认后 Analyst 开始生成报告。";
  if (phase === "analyzing") return "";
  if (phase === "done") return "报告为空。";
  return "上传 PDF 并完成人工审核后，这里会显示 Analyst 报告。";
}

export default function App() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [stage, setStage] = useState(-1);
  const [phase, setPhase] = useState<Phase>("idle");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [report, setReport] = useState("");
  const [fileName, setFileName] = useState("");
  const [threadId, setThreadId] = useState("");
  const [statusText, setStatusText] = useState("等待上传 PDF 文档");
  const [errorText, setErrorText] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);

  const chartEl = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportEl = useRef<HTMLPreElement>(null);
  const logsEl = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const phaseRef = useRef<Phase>(phase);

  const addLog = useCallback((text: string, kind: LogKind = "agent") => {
    setLogs((prev) => [...prev, { text, kind, t: new Date().toLocaleTimeString() }]);
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const el = reportEl.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [report]);

  useEffect(() => {
    const el = logsEl.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;

    const instance = echarts.init(el);
    chart.current = instance;

    instance.on("click", (params) => {
      if (params.dataType !== "edge" || phaseRef.current !== "waiting") return;
      const data = params.data as {
        id?: string;
        source?: string;
        target?: string;
        name?: string;
      };
      if (!data.id) return;
      setEdges((prev) => prev.filter((edge) => edge.id !== data.id));
      addLog(
        `人工删除关系：${data.source ?? ""} -${data.name ?? ""}-> ${data.target ?? ""}`,
        "human",
      );
    });

    const onResize = () => instance.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      instance.dispose();
      chart.current = null;
    };
  }, [addLog]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;

    const degree = (id: string) =>
      edges.reduce(
        (total, edge) =>
          total + (edge.source === id ? 1 : 0) + (edge.target === id ? 1 : 0),
        0,
      );

    instance.setOption(
      {
        backgroundColor: "transparent",
        tooltip: { trigger: "item" },
        // legend: {
        //   data: CATS.map((cat) => cat.name),
        //   textStyle: { color: "#8fa3bf" },
        //   top: 8,
        // },
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            cursor: "pointer",
            categories: CATS.map((cat) => ({
              name: cat.name,
              itemStyle: { color: cat.color },
            })),
            force: { repulsion: 420, edgeLength: 130, gravity: 0.08 },
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: 8,
            label: { show: true, color: "#e6f1ff", position: "bottom" },
            data: nodes.map((node) => {
              const links = degree(node.id);
              return {
                id: node.id,
                name: node.name,
                category: node.cat,
                symbolSize: 26 + Math.min(links * 5, 22),
                itemStyle: {
                  shadowBlur: 18,
                  shadowColor: CATS[node.cat]?.color ?? CATS[0].color,
                },
              };
            }),
            links: edges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              name: edge.label,
              label: {
                show: true,
                formatter: edge.label,
                color: edge.flagged ? "#ff2e63" : "#8fa3bf",
              },
              lineStyle: {
                color: edge.flagged ? "#ff2e63" : "#2a6f97",
                width: edge.flagged ? 3 : 1.5,
                type: edge.flagged ? "dashed" : "solid",
                curveness: 0.2,
              },
            })),
          },
        ],
      },
      true,
    );
  }, [nodes, edges]);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  function resetUploadState(name: string) {
    setFileName(name);
    setLogs([]);
    setNodes([]);
    setEdges([]);
    setReport("");
    setThreadId("");
    setErrorText("");
    setNotice("");
    setStage(0);
    setPhase("uploading");
    setStatusText("正在上传并解析文档…");
  }

  async function handleFile(file: File) {
    const invalid = validateFile(file);
    if (invalid) {
      setErrorText(invalid);
      addLog(invalid, "warn");
      setNotice(invalid);
      if (phaseRef.current === "idle" || phaseRef.current === "error") {
        setPhase("error");
        setStatusText("文件校验失败");
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    resetUploadState(file.name);
    addLog(`收到文档《${file.name}》，开始解析`, "agent");

    const result: { graph: GraphResult | null; paused: boolean; error: boolean } = {
      graph: null,
      paused: false,
      error: false,
    };

    const form = new FormData();
    form.append("file", file);

    try {
      await streamSSE(
        "/api/upload",
        { method: "POST", body: form },
        (event, data) => {
          if (event === "threadId") {
            const id = readText(data);
            if (id) {
              setThreadId(id);
              addLog("会话已创建，开始解析文档", "agent");
            }
            return;
          }

          if (event === "process") {
            const structured = isRecord(data) && isRecord(data.text) ? data.text : null;
            if (structured) {
              const nodeName = asString(structured.node_name);
              const update = isRecord(structured.update) ? structured.update : {};
              const nextAction = asString(update.next_action);

              if (nodeName) {
                addLog(NODE_DONE_LABEL[nodeName] ?? `节点 ${nodeName} 执行完毕`, "agent");
              }
              if (nextAction && NEXT_STEP_STATUS[nextAction]) {
                const next = NEXT_STEP_STATUS[nextAction];
                setStage(next.stage);
                setStatusText(next.text);
              }
              if (
                nodeName === "extractor" &&
                (Array.isArray(update.nodes) || Array.isArray(update.edges))
              ) {
                const graph = normalizeGraph(update.nodes, update.edges);
                result.graph = graph;
                setNodes(graph.nodes);
                setEdges(graph.edges);
                setStage(1);
                setStatusText("实体与关系抽取完成，准备校验…");
              } else if (nodeName === "validator") {
                setStage(2);
                setStatusText("校验完成，等待人工审核…");
              } else if (nodeName === "parser") {
                setStage(0);
                setStatusText("文档解析完成，准备抽取图谱…");
              }
              return;
            }

            const plain = readText(data);
            if (plain) {
              addLog(plain, "agent");
              setStatusText(plain);
            }
            return;
          }

          if (event === "graph") {
            const payload = isRecord(data) && isRecord(data.text) ? data.text : data;
            if (!isRecord(payload)) return;
            const graph = normalizeGraph(payload.nodes, payload.edges);
            const id = asString(payload.thread_id);
            if (id) setThreadId(id);
            if (graph.nodes.length === 0) return;
            result.graph = graph;
            result.paused = true;
            setNodes(graph.nodes);
            setEdges(graph.edges);
            setPhase("waiting");
            setStage(3);
            setStatusText("等待人工审核");
            addLog("进入人工审核，流程暂停（interrupt）", "wait");
            return;
          }

          if (event === "error") {
            const message = readText(data) || "文档处理失败";
            result.error = true;
            setErrorText(message);
            setPhase("error");
            setStatusText("处理失败");
            addLog(message, "warn");
            setNotice(message);
          }
        },
        controller.signal,
      );

      if (result.error) return;

      const graph = result.graph;
      if (graph && graph.nodes.length > 0) {
        // 兼容后端没有 graph 事件时：抽取到图谱即视为已暂停
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setPhase("waiting");
        setStage(3);
        setStatusText("等待人工审核");
        if (!result.paused) {
          addLog("进入人工审核，流程暂停（interrupt）", "wait");
        }
        return;
      }

      const message = "未获取到图谱数据，请确认 PDF 内容后重试";
      setErrorText(message);
      setPhase("error");
      setStatusText("处理失败");
      addLog(message, "warn");
      setNotice(message);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "上传失败，请重试";
      setErrorText(message);
      setPhase("error");
      setStatusText("处理失败");
      addLog(message, "warn");
      setNotice(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function confirmReview() {
    if (!threadId || phaseRef.current !== "waiting") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("analyzing");
    setStage(4);
    setStatusText("Analyst 正在生成报告…");
    setReport("");
    addLog("人工确认完成，恢复工作流（resume）", "human");

    const result = { finished: false, failed: false };
    let streamed = "";

    try {
      await streamSSE(
        "/api/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadId,
            modified_nodes: nodes.map((node) => ({
              id: node.id,
              name: node.name,
              category: node.category,
            })),
          }),
        },
        (event, data) => {
          if (event === "process") {
            const text = readText(data);
            if (text) {
              addLog(text, "agent");
              setStatusText(text);
            }
            return;
          }
          if (event === "report") {
            const token = readText(data);
            if (token) {
              streamed += token;
              setReport(streamed);
            }
            return;
          }
          if (event === "done") {
            const full = readReport(data) || streamed;
            setReport(full);
            setPhase("done");
            setStage(4);
            setStatusText("分析完成");
            addLog("Analyst 报告生成完成", "agent");
            result.finished = true;
            return;
          }
          if (event === "error") {
            const message = readText(data) || "报告生成失败";
            result.failed = true;
            setReport(`## 生成失败\n\n${message}`);
            setPhase("done");
            setStage(4);
            setStatusText("分析失败");
            addLog(message, "warn");
            setNotice(message);
          }
        },
        controller.signal,
      );

      if (!result.finished && !result.failed) {
        setPhase("done");
        setStatusText("报告流已结束");
        addLog("报告流已结束，未收到 done 事件", "warn");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "报告生成失败";
      setReport(`## 生成失败\n\n${message}`);
      setPhase("done");
      setStatusText("分析失败");
      addLog(message, "warn");
      setNotice(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleFile(file);
  }

  function hasFileDrag(event: DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className="app"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="file-input"
        onChange={onFileChange}
      />

      <header>
        <div className="brand">
          DOCGRAPH <b>SENTINEL</b>
        </div>
        <div className="stages">
          {STAGES.map((item, index) => {
            const classes = ["stage"];
            if (index === stage) classes.push("on");
            if (index < stage) classes.push("passed");
            if (item === "HITL") classes.push("hitl");
            return (
              <span key={item} className={classes.join(" ")}>
                {item}
              </span>
            );
          })}
        </div>
        <div className="header-status">
          <span
            className={`file-chip${fileName ? "" : " muted"}`}
            title={fileName || `仅支持 PDF，最大 ${MAX_FILE_SIZE_LABEL}`}
          >
            {fileName || `PDF · ≤ ${MAX_FILE_SIZE_LABEL}`}
          </span>
          <span className={`phase-chip ${phase}`} title={statusText}>
            {PHASE_LABEL[phase]}
          </span>
        </div>
      </header>

      <aside className="panel">
        <h3>AGENT 日志</h3>
        <div className="logs" ref={logsEl}>
          {logs.length === 0 ? (
            <div className="panel-empty">上传 PDF 后，Agent 的执行过程会实时显示在这里。</div>
          ) : (
            logs.map((log, index) => (
              <div key={`${log.t}-${index}`} className={`log ${log.kind}`}>
                <span>{log.t}</span>
                {log.text}
              </div>
            ))
          )}
        </div>
      </aside>

      <main className={"panel center" + (dragging ? " drag-active" : "")}>
        <div ref={chartEl} className="chart" />

        {(phase === "idle" || phase === "error") && (
          <div
            className="dropzone"
            role="button"
            tabIndex={0}
            aria-label="上传 PDF 文档"
            onClick={openFilePicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openFilePicker();
              }
            }}
          >
            <div className="drop-ring">
              <UploadIcon />
            </div>
            <div className="drop-title">拖拽 PDF 到此处</div>
            <div className="drop-sub">
              或点击选择文件 · 仅支持 PDF · 最大 {MAX_FILE_SIZE_LABEL}
            </div>
            {errorText && <div className="drop-error">{errorText}</div>}
          </div>
        )}

        {phase === "uploading" && nodes.length === 0 && (
          <div className="loading-layer">
            <div className="loader-ring" />
            <div className="loading-title">正在解析文档</div>
            <div className="loading-sub">{statusText}</div>
            <div className="loading-file">{fileName}</div>
          </div>
        )}

        {phase === "uploading" && nodes.length > 0 && (
          <div className="analyzing-pill">
            <span className="pulse-dot" />
            <span>{statusText}</span>
          </div>
        )}

        {phase === "uploading" && <div className="scan-line" />}

        {phase === "waiting" && (
          <div className="hitl-bar">
            <span>人工审核：点击图中的边可删除，然后提交</span>
            <button type="button" onClick={() => void confirmReview()}>
              确认并继续
            </button>
          </div>
        )}

        {phase === "analyzing" && (
          <div className="analyzing-pill">
            <span className="pulse-dot" />
            <span>Analyst 正在流式生成报告…</span>
          </div>
        )}

        {(phase === "waiting" || phase === "analyzing" || phase === "done") && (
          <button type="button" className="change-file" onClick={openFilePicker}>
            更换文档
          </button>
        )}

        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-overlay-inner">
              <UploadIcon size={48} />
              <strong>松开以上传 PDF</strong>
              <span>仅支持 PDF · 最大 {MAX_FILE_SIZE_LABEL}</span>
            </div>
          </div>
        )}
      </main>

      <aside className="panel">
        <h3>分析报告</h3>
        {phase === "analyzing" && (
          <div className="report-status">
            <span className="pulse-dot" />
            Analyst 正在逐 token 生成…
          </div>
        )}
        <pre
          ref={reportEl}
          className={"report" + (phase === "analyzing" ? " streaming" : "")}
        >
          {report || reportPlaceholder(phase)}
          {phase === "analyzing" && <span className="stream-cursor">▋</span>}
        </pre>
      </aside>

      {notice && (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  );
}
