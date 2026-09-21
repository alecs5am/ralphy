/**
 * Remocn scenes for the shaders-b shard.
 *
 * One component: `shader-voronoi`, a `@paper-design/shaders-react` wrapper (decision D1). Its
 * nearest-seed partition re-tessellates as the seeds drift past one another — neighbours swap and
 * edges appear and vanish — which no gradient stack computes, so it runs paper's real shader.
 */
import { stage } from "./shared";
import { scene, type SceneSpec } from "./types";

/**
 * `<Voronoi>`: flat two-colour cells separated by a thin `colorGap` seam. `glow` defaults to 0, so
 * there is no edge bloom at all — the cells are matte. The label is drawn as one more cell.
 */
export const shaderVoronoi = scene({
  id: "shader-voronoi",
  group: "shaders",
  shard: "shaders-b",
  stage: { w: 480, h: 270 },
  params: { speed: 1, distortion: 0.4, gap: 0.04, glow: 0 },
  palette: { bg: "#12121a", cell: "#3a3a5c", accent: "#52527a", text: "#c8c8d0" },
  paint: {
    engine: "paper",
    component: "Voronoi",
    props: { colors: ["@cell", "@accent"], colorGap: "@bg", distortion: 0.4, gap: 0.04, glow: 0, fit: "cover" },
  },
  motion: { kind: "loop", seconds: 18 },
  still: 0.55,
  markup: (ctx) => stage(
    `<div class="rv-paper"></div><p class="rv-tag"><i class="rv-seed"></i><span class="rv-title">${ctx.title}</span></p>`),
});

export const shadersB: readonly SceneSpec[] = [shaderVoronoi];
