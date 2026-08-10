export const reactHostGlobalKeys = [
  "window", "document", "Node", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT",
] as const;

class HostNode extends EventTarget {
  readonly namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly style = {} as CSSStyleDeclaration;
  readonly childNodes: HostNode[] = [];
  readonly tagName: string;
  parentNode: HostNode | null = null;
  nodeValue = "";
  #text = "";

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: Document,
  ) {
    super();
    this.tagName = nodeName;
  }

  setAttribute(): void {}
  removeAttribute(): void {}
  appendChild(node: HostNode): HostNode {
    this.#text = "";
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }
  insertBefore(node: HostNode, before: HostNode): HostNode {
    const index = this.childNodes.indexOf(before);
    if (index < 0) return this.appendChild(node);
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild(node: HostNode): HostNode {
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
    return node;
  }
  get firstChild(): HostNode | null { return this.childNodes[0] ?? null; }
  set textContent(value: string) {
    this.childNodes.length = 0;
    if (this.nodeType === 3) this.nodeValue = value;
    else this.#text = value;
  }
  get textContent(): string {
    return this.nodeType === 3
      ? this.nodeValue
      : this.#text || this.childNodes.map((node) => node.textContent).join("");
  }
}

export function createReactHost() {
  let document: Document;
  const rawDocument = Object.assign(new EventTarget(), {
    nodeType: 9,
    documentElement: undefined as unknown as HostNode,
    defaultView: undefined as unknown as object,
    activeElement: null,
    createElement: (name) => new HostNode(1, name.toUpperCase(), document),
    createElementNS: (_namespace, name) => new HostNode(1, name.toUpperCase(), document),
    createTextNode: (value) => {
      const node = new HostNode(3, "#text", document);
      node.textContent = value;
      return node;
    },
  });
  document = rawDocument as unknown as Document;
  rawDocument.documentElement = new HostNode(1, "HTML", document);
  const window = Object.assign(new EventTarget(), {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: HostNode,
    Node: HostNode,
  });
  rawDocument.defaultView = window;
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = new Map(
    reactHostGlobalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  Object.assign(globals, {
    window,
    document,
    Node: HostNode,
    HTMLElement: HostNode,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return {
    container: new HostNode(1, "DIV", document),
    restore: () => {
      for (const key of reactHostGlobalKeys) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globals[key];
      }
    },
  };
}
