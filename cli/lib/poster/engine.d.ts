// `engine.js` is a browser script for HyperFrames compositions. The CLI only
// imports it as text (`with { type: "text" }`) to assemble it into a
// project's index.html, so its module type is the file content (#598).
declare const content: string;
export default content;
