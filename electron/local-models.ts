import { execFile as execFileCallback } from "node:child_process";
import { statfs } from "node:fs/promises";
import { arch, cpus, homedir, platform, release, totalmem } from "node:os";
import { promisify } from "node:util";
import type {
  LocalInstalledModel,
  LocalModelCatalog,
  LocalModelComfort,
  LocalModelDetail,
  LocalModelFile,
  LocalModelMachine,
  LocalModelProvider,
  LocalModelReference,
  LocalModelRuntimeId,
  LocalModelSearchInput,
  LocalModelSummary,
} from "./media/types";

const execFile = promisify(execFileCallback);
const GB = 1024 ** 3;
const PROVIDER_MEDIA_HOSTS = new Set([
  "huggingface.co",
  "cdn-uploads.huggingface.co",
  "cdn-avatars.huggingface.co",
  "image.civitai.com",
  "image-b2.civitai.com",
]);
const PROVIDER_PAGE_HOSTS = new Set(["huggingface.co", "civitai.com", "www.civitai.com", "modelscope.cn"]);
const PROVIDER_TIMEOUT_MS = 8_000;
const huggingFaceAvatarCache = new Map<string, Promise<string | null>>();

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string | Request, init?: RequestInit) => Promise<Response>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true || value === "auto" || value === "manual";
}

export function parseLocalModelSearchInput(value: unknown): LocalModelSearchInput {
  if (value === undefined) return {};
  const input = record(value);
  const keys = Object.keys(input);
  if (keys.some((key) => !["query", "provider", "sort", "limit"].includes(key))) throw new Error("Invalid Local Models search");
  const query = input.query === undefined ? undefined : text(input.query).trim();
  const provider = input.provider === undefined ? undefined : text(input.provider);
  const sort = input.sort === undefined ? undefined : text(input.sort);
  const limit = input.limit === undefined ? undefined : number(input.limit, -1);
  if ((query !== undefined && (query.length > 256 || typeof input.query !== "string"))
    || (provider !== undefined && !["all", "huggingface", "civitai", "modelscope"].includes(provider))
    || (sort !== undefined && !["trending", "downloads", "updated", "comfort", "size"].includes(sort))
    || (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 24))) {
    throw new Error("Invalid Local Models search");
  }
  return {
    ...(query ? { query } : {}),
    ...(provider ? { provider: provider as LocalModelSearchInput["provider"] } : {}),
    ...(sort ? { sort: sort as LocalModelSearchInput["sort"] } : {}),
    ...(limit ? { limit } : {}),
  };
}

export function parseLocalModelReference(value: unknown): LocalModelReference {
  const input = record(value);
  if (Object.keys(input).some((key) => !["provider", "id"].includes(key))) throw new Error("Invalid model reference");
  const provider = text(input.provider);
  const id = text(input.id);
  const repositoryId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  const valid = provider === "civitai" ? /^\d{1,12}$/.test(id)
    : (provider === "huggingface" || provider === "modelscope") && repositoryId.test(id);
  if (!valid) throw new Error("Invalid model reference");
  return { provider: provider as LocalModelProvider, id };
}

export function parseLocalModelProviderUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) throw new Error("Invalid provider URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !PROVIDER_PAGE_HOSTS.has(url.hostname)) throw new Error();
    return url.toString();
  } catch {
    throw new Error("Invalid provider URL");
  }
}

function formatBytes(bytes: number): string {
  const value = bytes / GB;
  return `${value >= 10 && Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : value.toFixed(1)} GB`;
}

function titleFromId(id: string): string {
  return id.split("/").at(-1)?.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || id;
}

function isMultimodalTask(task: string): boolean {
  return /multimodal|image(?:-text|-to-text)|visual-question|document-question/i.test(task);
}

function modalityForTask(task: string): LocalModelSummary["modality"] {
  if (isMultimodalTask(task)) return "multimodal";
  if (/image|depth|segment/i.test(task)) return "image";
  if (/video/i.test(task)) return "video";
  if (/audio|speech|voice|music/i.test(task)) return "audio";
  if (/text|token|embedding|feature-extraction|fill-mask|translation/i.test(task)) return "text";
  return "unknown";
}

function runtimeFor(task: string, format: string): LocalModelRuntimeId {
  if (/mlx/i.test(format)) return "mlx";
  if (/gguf/i.test(format)) return "ollama";
  if (isMultimodalTask(task)) return "transformers";
  if (/image|video/i.test(task)) return "diffusers";
  return "transformers";
}

function memoryMultiplier(task: string, format: string): number {
  if (/video/i.test(task)) return 2.25;
  if (isMultimodalTask(task)) return 1.5;
  if (/image/i.test(task)) return 1.9;
  if (/audio|speech|voice|music/i.test(task)) return 1.45;
  if (/gguf/i.test(format)) return 1.2;
  return 1.35;
}

export function assessModelComfort(
  model: { task: string; format: string; bytes: number | null; runtime?: LocalModelRuntimeId },
  machine: LocalModelMachine,
): LocalModelComfort {
  const runtime = model.runtime ?? runtimeFor(model.task, model.format);
  const detected = machine.runtimes.find((item) => item.id === runtime);
  if (model.bytes === null || model.bytes <= 0) {
    return {
      level: "unknown", label: "Not enough data", score: 0, runtime,
      estimatedMemoryBytes: null,
      evidence: ["Provider did not declare package bytes", detected?.available ? `${detected.label} detected` : `${detected?.label ?? runtime} not detected`],
    };
  }
  const estimatedMemoryBytes = model.bytes * memoryMultiplier(model.task, model.format);
  const evidence = [
    `Estimated peak memory ${formatBytes(estimatedMemoryBytes)} of ${formatBytes(machine.totalMemoryBytes)}`,
    `${formatBytes(machine.freeDiskBytes)} free · ${formatBytes(model.bytes)} package`,
    `${machine.cpu} · ${machine.architecture}`,
    detected?.available ? `${detected.label} detected` : `${detected?.label ?? runtime} not detected`,
  ];
  if (model.bytes > machine.freeDiskBytes || estimatedMemoryBytes > machine.totalMemoryBytes * 0.96) {
    return { level: "incompatible", label: "Will not fit comfortably", score: 0, runtime, estimatedMemoryBytes, evidence };
  }
  const ratio = estimatedMemoryBytes / machine.totalMemoryBytes;
  const fit: LocalModelComfort = ratio <= 0.45
    ? { level: "comfortable", label: "Comfortable here", score: 4, runtime, estimatedMemoryBytes, evidence }
    : ratio <= 0.65
      ? { level: "usable", label: "Usable here", score: 3, runtime, estimatedMemoryBytes, evidence }
      : ratio <= 0.82
        ? { level: "tight", label: "Tight but workable", score: 2, runtime, estimatedMemoryBytes, evidence }
        : { level: "tight", label: "Uncomfortable here", score: 1, runtime, estimatedMemoryBytes, evidence };
  return !detected?.available
    ? { ...fit, level: "unknown", label: "Runtime setup required", score: 0 }
    : fit;
}

export function safeProviderMediaUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || !PROVIDER_MEDIA_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function modelFiles(raw: JsonRecord): LocalModelFile[] {
  return array(raw.siblings).map((value) => {
    const file = record(value);
    const name = text(file.rfilename);
    const bytes = number(file.size, number(record(file.lfs).size, -1));
    const lower = name.toLocaleLowerCase();
    const format = lower.endsWith(".gguf") ? "GGUF"
      : lower.endsWith(".safetensors") ? "Safetensors"
      : lower.endsWith(".onnx") ? "ONNX"
      : lower.endsWith(".ckpt") || lower.endsWith(".bin") ? "Pickle"
      : name.split(".").at(-1)?.toLocaleUpperCase() || "File";
    return {
      name,
      bytes: bytes >= 0 ? bytes : null,
      format,
      recommended: false,
      warning: format === "Pickle" ? "Executable checkpoint format" : null,
    };
  }).filter((file) => file.name.length > 0);
}

function recommendedFiles(files: LocalModelFile[]): LocalModelFile[] {
  const safe = files.filter((file) => file.format !== "Pickle");
  const gguf = safe.filter((file) => file.format === "GGUF");
  if (gguf.length) {
    for (const quant of ["q5_k_m", "q4_k_m", "q4_0", "q3_k_m", "q2_k"]) {
      const match = gguf.filter((file) => file.name.toLocaleLowerCase().includes(quant));
      if (match.length) {
        const split = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;
        const groups = new Map<string, { total: number; files: LocalModelFile[] }>();
        const candidates = match.filter((file) => !split.test(file.name)).map((file) => [file]);
        for (const file of match) {
          const parts = file.name.match(split);
          if (!parts) continue;
          const key = `${parts[1]}:${parts[3]}`;
          const group = groups.get(key) ?? { total: Number(parts[3]), files: [] };
          group.files.push(file);
          groups.set(key, group);
        }
        candidates.push(...[...groups.values()].filter((group) => group.files.length === group.total).map((group) => group.files));
        if (!candidates.length) return match;
        return candidates.reduce((best, candidate) => {
          const size = (items: LocalModelFile[]) => items.every((file) => file.bytes !== null)
            ? items.reduce((sum, file) => sum + (file.bytes ?? 0), 0)
            : Infinity;
          const difference = size(candidate) - size(best);
          return difference < 0 || (difference === 0 && candidate.length < best.length) ? candidate : best;
        });
      }
    }
    return [gguf.reduce((smallest, file) => (file.bytes ?? Infinity) < (smallest.bytes ?? Infinity) ? file : smallest)];
  }
  const safetensors = safe.filter((file) => file.format === "Safetensors");
  if (safetensors.length) {
    const choose = (items: LocalModelFile[]) => {
      const split = /^(.*)-(\d{5})-of-(\d{5})\.safetensors$/i;
      const candidates = items.filter((file) => !split.test(file.name)).map((file) => [file]);
      const groups = new Map<string, { total: number; files: LocalModelFile[] }>();
      for (const file of items) {
        const parts = file.name.match(split);
        if (!parts) continue;
        const key = `${parts[1]}:${parts[3]}`;
        const group = groups.get(key) ?? { total: Number(parts[3]), files: [] };
        group.files.push(file);
        groups.set(key, group);
      }
      candidates.push(...[...groups.values()].filter((group) => group.files.length === group.total).map((group) => group.files));
      if (!candidates.length) return items;
      return candidates.reduce((best, candidate) => {
        const size = (files: LocalModelFile[]) => files.every((file) => file.bytes !== null)
          ? files.reduce((sum, file) => sum + (file.bytes ?? 0), 0)
          : Infinity;
        return size(candidate) < size(best) ? candidate : best;
      });
    };
    const root = safetensors.filter((file) => !file.name.includes("/"));
    if (root.length) {
      const primary = root.filter((file) => !/^(?:ae|vae|encoder|decoder|text[_-]?encoder|clip|t5|lora|adapter)(?:[._-]|$)/i.test(file.name));
      return choose(primary.length ? primary : root);
    }
    const directories = safetensors.reduce((groups, file) => {
      const directory = file.name.slice(0, file.name.lastIndexOf("/"));
      groups.set(directory, [...(groups.get(directory) ?? []), file]);
      return groups;
    }, new Map<string, LocalModelFile[]>());
    return [...directories.values()].flatMap(choose);
  }
  const onnx = safe.filter((file) => file.format === "ONNX");
  if (onnx.length) return onnx;
  return safe.length ? [safe[0]] : [];
}

function packageFrom(files: LocalModelFile[], tags: string[]) {
  const selected = recommendedFiles(files);
  const bytes = selected.every((file) => file.bytes !== null)
    ? selected.reduce((sum, file) => sum + (file.bytes ?? 0), 0)
    : null;
  const first = selected[0];
  const quant = first?.name.match(/q\d(?:_[a-z0-9]+)+/i)?.[0]?.toLocaleUpperCase();
  const format = quant ? `GGUF ${quant}`
    : first?.format ?? (tags.find((tag) => /gguf|safetensors|onnx|mlx/i.test(tag)) ?? "Unknown");
  const names = new Set(selected.map((file) => file.name));
  for (const file of files) file.recommended = names.has(file.name);
  return { format, bytes, files: selected.map((file) => file.name) };
}

function baseModel(cardData: JsonRecord): string | null {
  const value = cardData.base_model;
  if (typeof value === "string") return value;
  return array(value).find((item): item is string => typeof item === "string") ?? null;
}

export function normalizeHuggingFaceModel(rawValue: unknown, machine: LocalModelMachine): LocalModelSummary {
  const raw = record(rawValue);
  const id = text(raw.id);
  const cardData = record(raw.cardData);
  const tags = array(raw.tags).filter((tag): tag is string => typeof tag === "string");
  const task = text(raw.pipeline_tag, text(cardData.pipeline_tag, "unknown"));
  const files = modelFiles(raw);
  const recommendedPackage = packageFrom(files, tags);
  const comfort = assessModelComfort({ task, format: recommendedPackage.format, bytes: recommendedPackage.bytes }, machine);
  const licenseTag = tags.find((tag) => tag.startsWith("license:"))?.slice(8) ?? null;
  const thumbnail = safeProviderMediaUrl(cardData.thumbnail);
  return {
    provider: "huggingface",
    id,
    name: titleFromId(id),
    author: text(raw.author, id.split("/")[0] ?? "Hugging Face"),
    task,
    modality: modalityForTask(task),
    modelType: tags.some((tag) => /lora|adapter|peft/i.test(tag)) ? "Adapter" : "Base",
    baseModel: baseModel(cardData),
    license: text(cardData.license_name, text(cardData.license, licenseTag ?? "")) || null,
    gated: bool(raw.gated),
    revision: text(raw.sha) || null,
    lastModified: text(raw.lastModified) || null,
    downloads: number(raw.downloads),
    likes: number(raw.likes),
    tags,
    iconUrl: null,
    previewUrl: thumbnail,
    providerUrl: `https://huggingface.co/${id}`,
    recommendedPackage,
    comfort,
    state: bool(raw.gated) ? "gated" : "remote",
    permissions: [],
  };
}

export function normalizeCivitaiModel(rawValue: unknown, machine: LocalModelMachine): LocalModelSummary {
  const raw = record(rawValue);
  const version = record(array(raw.modelVersions)[0]);
  const files = array(version.files).map((value) => {
    const file = record(value);
    const name = text(file.name);
    const rawFormat = text(record(file.metadata).format, name.toLocaleLowerCase().endsWith(".safetensors") ? "Safetensors" : "File");
    const format = /safetensor/i.test(rawFormat) ? "Safetensors" : rawFormat;
    return {
      name,
      bytes: number(file.sizeKB, -1) >= 0 ? number(file.sizeKB) * 1024 : null,
      format,
      recommended: false,
      warning: /pickle|ckpt/i.test(format) ? "Executable checkpoint format" : null,
    } satisfies LocalModelFile;
  }).filter((file) => file.name.length > 0);
  const tags = array(raw.tags).filter((tag): tag is string => typeof tag === "string");
  const recommendedPackage = packageFrom(files, tags);
  const descriptor = [raw.name, raw.type, version.baseModel, ...tags].map((value) => text(value)).join(" ");
  const task = /video|\bwan\b|cogvideo|animatediff|hunyuan.*video|\bltx\b/i.test(descriptor)
    ? "text-to-video"
    : /audio|speech|voice|music/i.test(descriptor)
      ? "text-to-audio"
      : "text-to-image";
  const commercialScopes = array(raw.allowCommercialUse).filter((value): value is string => typeof value === "string");
  const commercial = commercialScopes.length > 0;
  const permissions = [
    commercial ? `Commercial use allowed: ${commercialScopes.join(", ")}` : "Commercial use not permitted",
    raw.allowDerivatives === true ? "Derivatives permitted" : "Derivatives restricted",
    raw.allowNoCredit === true ? "No creator credit required" : "Creator credit required",
    raw.allowDifferentLicense === true ? "Alternate license permitted" : "Alternate license restricted",
  ];
  const previewUrl = array(version.images)
    .map((image) => safeProviderMediaUrl(record(image).url))
    .find((url): url is string => url !== null) ?? null;
  const id = String(number(raw.id));
  return {
    provider: "civitai",
    id,
    name: text(raw.name, `Civitai model ${id}`),
    author: text(record(raw.creator).username, "Civitai"),
    task,
    modality: modalityForTask(task),
    modelType: text(raw.type, "Model"),
    baseModel: text(version.baseModel) || null,
    license: commercial ? "Creator terms" : "Restricted creator terms",
    gated: false,
    revision: text(version.name) || String(number(version.id)) || null,
    lastModified: text(raw.updatedAt) || null,
    downloads: number(record(raw.stats).downloadCount),
    likes: number(record(raw.stats).thumbsUpCount),
    tags,
    iconUrl: safeProviderMediaUrl(record(raw.creator).image),
    previewUrl,
    providerUrl: `https://civitai.com/models/${id}`,
    recommendedPackage,
    comfort: assessModelComfort({ task, format: recommendedPackage.format, bytes: recommendedPackage.bytes }, machine),
    state: "remote",
    permissions,
  };
}

function readmePreviewUrls(markdown: string, modelId: string, revision: string | null): string[] {
  const base = `https://huggingface.co/${modelId}/resolve/${revision ?? "main"}/`;
  const candidates = [
    ...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g),
    ...markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  return [...new Set(candidates.map((url) => safeProviderMediaUrl(url, base)).filter((url): url is string => url !== null))].slice(0, 5);
}

async function jsonResponse(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  return response.json();
}

function providerFetch(fetcher: Fetcher, input: string | Request, init?: RequestInit): Promise<Response> {
  return fetcher(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
}

async function fetchHuggingFaceAvatar(author: string, fetcher: Fetcher): Promise<string | null> {
  const load = async () => {
    for (const kind of ["organizations", "users"]) {
      try {
        const response = await providerFetch(fetcher, `https://huggingface.co/api/${kind}/${encodeURIComponent(author)}/overview`);
        if (!response.ok) continue;
        const avatar = safeProviderMediaUrl(record(await response.json()).avatarUrl);
        if (avatar) return avatar;
      } catch { /* try the other owner kind */ }
    }
    return null;
  };
  if (fetcher !== fetch) return load();
  const key = author.toLocaleLowerCase();
  const cached = huggingFaceAvatarCache.get(key) ?? load();
  huggingFaceAvatarCache.set(key, cached);
  return cached;
}

export async function loadHuggingFaceDetail(
  id: string,
  machine: LocalModelMachine,
  fetcher: Fetcher = fetch,
): Promise<LocalModelDetail> {
  const encoded = id.split("/").map(encodeURIComponent).join("/");
  const raw = await jsonResponse(await providerFetch(fetcher, `https://huggingface.co/api/models/${encoded}?blobs=true`), "Hugging Face");
  const normalized = normalizeHuggingFaceModel(raw, machine);
  const summary = { ...normalized, iconUrl: await fetchHuggingFaceAvatar(normalized.author, fetcher) };
  const readmeResponse = await providerFetch(fetcher, `https://huggingface.co/${encoded}/raw/${encodeURIComponent(summary.revision ?? "main")}/README.md`);
  const readme = readmeResponse.ok
    ? (await readmeResponse.text()).slice(0, 256 * 1024)
    : summary.gated
      ? "# Access required\n\nThis model card is gated by Hugging Face. Open the provider page to request access."
      : "# Model card unavailable\n\nHugging Face did not return a README for this revision.";
  const rawRecord = record(raw);
  const files = modelFiles(rawRecord);
  packageFrom(files, summary.tags);
  const previewUrls = [summary.previewUrl, ...readmePreviewUrls(readme, id, summary.revision)]
    .filter((url): url is string => url !== null);
  return { ...summary, readme, previewUrls: [...new Set(previewUrls)].slice(0, 5), files };
}

async function loadCivitaiDetail(
  id: string,
  machine: LocalModelMachine,
  fetcher: Fetcher,
): Promise<LocalModelDetail> {
  const raw = await jsonResponse(await providerFetch(fetcher, `https://civitai.com/api/v1/models/${encodeURIComponent(id)}`), "Civitai");
  const summary = normalizeCivitaiModel(raw, machine);
  const rawRecord = record(raw);
  const version = record(array(rawRecord.modelVersions)[0]);
  const files = array(version.files).map((value) => {
    const file = record(value);
    const name = text(file.name);
    const rawFormat = text(record(file.metadata).format, "File");
    const format = /safetensor/i.test(rawFormat) ? "Safetensors" : rawFormat;
    return { name, bytes: number(file.sizeKB, -1) >= 0 ? number(file.sizeKB) * 1024 : null, format, recommended: /safetensor/i.test(format), warning: /pickle|ckpt/i.test(format) ? "Executable checkpoint format" : null };
  });
  const previewUrls = array(version.images).map((image) => safeProviderMediaUrl(record(image).url)).filter((url): url is string => url !== null).slice(0, 5);
  const description = text(rawRecord.description).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim();
  return { ...summary, readme: `# ${summary.name}\n\n${description || "No model description was supplied by the creator."}`, previewUrls, files };
}

export async function loadLocalModelDetail(
  ref: LocalModelReference,
  machine: LocalModelMachine,
  fetcher: Fetcher = fetch,
): Promise<LocalModelDetail> {
  if (ref.provider === "huggingface") return loadHuggingFaceDetail(ref.id, machine, fetcher);
  if (ref.provider === "civitai") return loadCivitaiDetail(ref.id, machine, fetcher);
  throw new Error("ModelScope browsing is not available yet");
}

async function detailedHuggingFaceResults(values: unknown[], machine: LocalModelMachine, fetcher: Fetcher): Promise<LocalModelSummary[]> {
  return Promise.all(values.map(async (value) => {
    const id = text(record(value).id);
    if (!id) return null;
    let summary: LocalModelSummary;
    try {
      const encoded = id.split("/").map(encodeURIComponent).join("/");
      summary = normalizeHuggingFaceModel(await jsonResponse(await providerFetch(fetcher, `https://huggingface.co/api/models/${encoded}?blobs=true`), "Hugging Face"), machine);
    } catch {
      summary = normalizeHuggingFaceModel(value, machine);
    }
    return { ...summary, iconUrl: await fetchHuggingFaceAvatar(summary.author, fetcher) };
  })).then((items) => items.filter((item): item is LocalModelSummary => item !== null));
}

async function searchHuggingFace(input: LocalModelSearchInput, machine: LocalModelMachine, fetcher: Fetcher, limit: number): Promise<LocalModelSummary[]> {
  const query = new URLSearchParams({ limit: String(limit), full: "true", sort: input.sort === "updated" ? "lastModified" : input.sort === "downloads" ? "downloads" : "trendingScore", direction: "-1" });
  if (input.query?.trim()) query.set("search", input.query.trim());
  const raw = await jsonResponse(await providerFetch(fetcher, `https://huggingface.co/api/models?${query}`), "Hugging Face");
  return detailedHuggingFaceResults(array(raw), machine, fetcher);
}

async function searchCivitai(input: LocalModelSearchInput, machine: LocalModelMachine, fetcher: Fetcher, limit: number): Promise<LocalModelSummary[]> {
  const query = new URLSearchParams({ limit: String(limit), nsfw: "false", sort: input.sort === "updated" ? "Newest" : "Most Downloaded" });
  if (input.query?.trim()) query.set("query", input.query.trim());
  const raw = record(await jsonResponse(await providerFetch(fetcher, `https://civitai.com/api/v1/models?${query}`), "Civitai"));
  return array(raw.items).map((value) => normalizeCivitaiModel(value, machine));
}

export async function searchLocalModels(
  input: LocalModelSearchInput = {},
  machine?: LocalModelMachine,
  fetcher: Fetcher = fetch,
): Promise<LocalModelCatalog> {
  const snapshot = machine ?? await loadLocalModelMachine(fetcher);
  const provider = input.provider ?? "all";
  const limit = Math.max(1, Math.min(24, input.limit ?? 8));
  const searches: { provider: LocalModelProvider; run: () => Promise<LocalModelSummary[]> }[] = [];
  if (provider === "all" || provider === "huggingface") searches.push({ provider: "huggingface", run: () => searchHuggingFace(input, snapshot, fetcher, provider === "all" ? Math.max(6, limit - 2) : limit) });
  if (provider === "all" || provider === "civitai") searches.push({ provider: "civitai", run: () => searchCivitai(input, snapshot, fetcher, provider === "all" ? 2 : limit) });
  if (provider === "modelscope") searches.push({ provider: "modelscope", run: async () => { throw new Error("ModelScope catalogue integration is not available yet"); } });
  const settled = await Promise.all(searches.map(async ({ provider: source, run }) => {
    try { return { source, items: await run(), error: null }; }
    catch (cause) { return { source, items: [], error: cause instanceof Error ? cause.message : String(cause) }; }
  }));
  const items = settled.flatMap((result) => result.items);
  if (input.sort === "comfort") items.sort((left, right) => right.comfort.score - left.comfort.score || right.downloads - left.downloads);
  if (input.sort === "size") items.sort((left, right) => (left.recommendedPackage.bytes ?? Infinity) - (right.recommendedPackage.bytes ?? Infinity));
  return {
    items: items.slice(0, limit),
    machine: snapshot,
    refreshedAt: new Date().toISOString(),
    errors: settled.flatMap((result) => result.error ? [{ provider: result.source, message: result.error }] : []),
  };
}

async function pythonRuntimes(): Promise<Partial<Record<LocalModelRuntimeId, string>>> {
  try {
    const script = "import importlib.util,json; print(json.dumps({n:bool(importlib.util.find_spec(n)) for n in ['diffusers','transformers','mlx']}))";
    const { stdout } = await execFile("/usr/bin/env", ["python3", "-c", script], { timeout: 1_500 });
    const found = record(JSON.parse(stdout));
    return {
      diffusers: found.diffusers ? "Detected in Python" : "Not detected",
      transformers: found.transformers ? "Detected in Python" : "Not detected",
      mlx: found.mlx ? "Detected in Python" : "Not detected",
    };
  } catch {
    return {};
  }
}

async function ollamaInventory(fetcher: Fetcher): Promise<{ label: string; installed: LocalInstalledModel[] } | null> {
  try {
    const response = await fetcher("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const raw = record(await response.json());
    const installed = array(raw.models).map((value) => {
      const model = record(value);
      const details = record(model.details);
      return {
        id: text(model.model, text(model.name)),
        name: text(model.name, text(model.model)),
        runtime: "ollama",
        digest: text(model.digest),
        bytes: number(model.size),
        format: [text(details.family), text(details.parameter_size), text(details.quantization_level)].filter(Boolean).join(" · "),
        updatedAt: text(model.modified_at) || null,
      } satisfies LocalInstalledModel;
    });
    return { label: "Ollama", installed };
  } catch {
    return null;
  }
}

export async function loadLocalModelMachine(fetcher: Fetcher = fetch): Promise<LocalModelMachine> {
  const [python, ollama, disk] = await Promise.all([
    pythonRuntimes(),
    ollamaInventory(fetcher),
    statfs(homedir(), { bigint: true }).catch(() => null),
  ]);
  const version = platform() === "darwin"
    ? await execFile("/usr/bin/sw_vers", ["-productVersion"], { timeout: 1_000 }).then(({ stdout }) => stdout.trim()).catch(() => release())
    : release();
  const runtime = (id: LocalModelRuntimeId, label: string, detail?: string) => ({ id, label, available: detail?.startsWith("Detected") ?? false, detail: detail ?? "Not detected" });
  return {
    platform: `${platform() === "darwin" ? "macOS" : platform()} ${version}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "Unknown CPU",
    totalMemoryBytes: totalmem(),
    freeDiskBytes: disk ? Number(disk.bavail * disk.bsize) : 0,
    runtimes: [
      { id: "ollama", label: ollama?.label ?? "Ollama", available: ollama !== null, detail: ollama ? `Detected · ${ollama.installed.length} models registered` : "Not detected" },
      runtime("diffusers", "Diffusers", python.diffusers),
      runtime("transformers", "Transformers", python.transformers),
      runtime("mlx", "MLX", python.mlx),
    ],
    installed: ollama?.installed ?? [],
  };
}
