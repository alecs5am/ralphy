export const reactHostGlobalKeys = [
  "window", "document", "Node", "NodeFilter", "Element", "HTMLElement", "HTMLInputElement", "DocumentFragment", "ResizeObserver", "IntersectionObserver", "MutationObserver", "CustomEvent", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT",
] as const;

type Listener = EventListenerOrEventListenerObject;

export class HostNode {
  readonly namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly style = Object.assign({} as Record<string, string>, {
    setProperty(name: string, value: string) { this[name] = value; },
    removeProperty(name: string) { delete this[name]; },
  }) as unknown as CSSStyleDeclaration;
  readonly childNodes: HostNode[] = [];
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  parentNode: HostNode | null = null;
  nodeValue = "";
  clientWidth = 800;
  clientHeight = 600;
  scrollWidth = 800;
  scrollHeight = 600;
  scrollTop = 0;
  tabIndex = -1;
  disabled = false;
  #text = "";
  #listeners = new Map<string, Set<Listener>>();

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: Document,
  ) {
    this.tagName = nodeName;
    if (nodeName === "BUTTON") this.tabIndex = 0;
  }

  addEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    const listeners = this.#listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener | null): void {
    if (listener) this.#listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event): boolean {
    if (event.target === null) Object.defineProperty(event, "target", { configurable: true, value: this });
    for (let node: HostNode | null = this; node; node = event.bubbles ? node.parentNode : null) {
      Object.defineProperty(event, "currentTarget", { configurable: true, value: node });
      for (const listener of node.#listeners.get(event.type) ?? []) {
        if (typeof listener === "function") listener.call(node, event);
        else listener.handleEvent(event);
      }
      if (event.cancelBubble) break;
    }
    Object.defineProperty(event, "currentTarget", { configurable: true, value: null });
    if (!event.defaultPrevented && event.type === "keydown" && (event as Event & { key?: string }).key === "Tab") this.#focusNext();
    if (!event.defaultPrevented && this.tagName === "BUTTON" && !this.disabled) {
      const key = (event as Event & { key?: string }).key;
      if ((event.type === "keydown" && key === "Enter") || (event.type === "keyup" && key === " ")) {
        this.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      }
    }
    return !event.defaultPrevented;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === "tabindex") this.tabIndex = Number(value);
    if (name === "disabled") this.disabled = true;
  }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  getAttributeNames(): string[] { return [...this.attributes.keys()]; }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }
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
  insertAdjacentElement(position: InsertPosition, node: HostNode): HostNode | null {
    if (position === "afterbegin") return this.firstChild ? this.insertBefore(node, this.firstChild) : this.appendChild(node);
    if (position === "beforeend") return this.appendChild(node);
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    const before = position === "beforebegin" ? this : this.parentNode.childNodes[index + 1];
    return before ? this.parentNode.insertBefore(node, before) : this.parentNode.appendChild(node);
  }
  removeChild(node: HostNode): HostNode {
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
    return node;
  }
  remove(): void { this.parentNode?.removeChild(this); }
  get firstChild(): HostNode | null { return this.childNodes[0] ?? null; }
  get children(): HostNode[] { return this.childNodes.filter((node) => node.nodeType === 1); }
  get options(): HostNode[] { return this.findAll((node) => node.tagName === "OPTION"); }
  get parentElement(): HostNode | null { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get isConnected(): boolean {
    let node: HostNode | null = this;
    while (node?.parentNode) node = node.parentNode;
    return node?.tagName === "HTML";
  }
  get offsetWidth(): number { return this.clientWidth; }
  get offsetHeight(): number { return this.clientHeight; }
  getBoundingClientRect(): DOMRect {
    return { x: 0, y: 0, top: 0, left: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight, toJSON: () => ({}) } as DOMRect;
  }
  getClientRects(): DOMRect[] { return [this.getBoundingClientRect()]; }
  scrollTo(value: ScrollToOptions | number, y?: number): void {
    this.scrollTop = typeof value === "number" ? (y ?? 0) : (value.top ?? this.scrollTop);
    this.dispatchEvent(new Event("scroll"));
  }
  focus(): void { (this.ownerDocument as Document & { activeElement: HostNode | null }).activeElement = this; }
  blur(): void {
    const document = this.ownerDocument as Document & { activeElement: HostNode | null };
    if (document.activeElement === this) document.activeElement = null;
  }
  contains(node: HostNode | null): boolean { return node === this || this.childNodes.some((child) => child.contains(node)); }
  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const value = part.trim();
      const attribute = value.match(/^\[([^=\]]+)(?:=['\"]?([^'\"]+)['\"]?)?\]$/);
      if (attribute) return attribute[2] === undefined ? this.attributes.has(attribute[1]) : this.getAttribute(attribute[1]) === attribute[2];
      if (value.startsWith(".")) return (this.getAttribute("class") ?? "").split(/\s+/).includes(value.slice(1));
      if (value.startsWith("#")) return this.getAttribute("id") === value.slice(1);
      return this.tagName === value.toUpperCase();
    });
  }
  closest(selector: string): HostNode | null {
    for (let node: HostNode | null = this; node; node = node.parentNode) if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector: string): HostNode[] {
    const parts = selector.trim().split(/\s+/);
    return this.findAll((node) => {
      if (!node.matches(parts.at(-1)!)) return false;
      let ancestor = node.parentNode;
      for (let index = parts.length - 2; index >= 0; index -= 1) {
        while (ancestor && !ancestor.matches(parts[index])) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    });
  }
  querySelector(selector: string): HostNode | null { return this.querySelectorAll(selector)[0] ?? null; }
  #focusNext(): void {
    let root: HostNode = this;
    while (root.parentNode) root = root.parentNode;
    const focusable = root.findAll((node) => node.tagName === "BUTTON" && !node.disabled && node.tabIndex !== -1);
    const index = focusable.indexOf(this);
    focusable[(index + 1) % focusable.length]?.focus();
  }
  findAll(predicate: (node: HostNode) => boolean): HostNode[] {
    return [...(predicate(this) ? [this] : []), ...this.childNodes.flatMap((node) => node.findAll(predicate))];
  }
  set textContent(value: string) {
    this.childNodes.length = 0;
    if (this.nodeType === 3) this.nodeValue = value;
    else this.#text = value;
  }
  get textContent(): string {
    return this.nodeType === 3 ? this.nodeValue : this.#text || this.childNodes.map((node) => node.textContent).join("");
  }
}

export function createReactHost() {
  let document: Document;
  const rawDocument = Object.assign(new EventTarget(), {
    nodeType: 9,
    documentElement: undefined as unknown as HostNode,
    body: undefined as unknown as HostNode,
    head: undefined as unknown as HostNode,
    defaultView: undefined as unknown as object,
    activeElement: null as HostNode | null,
    createElement: (name: string) => new HostNode(1, name.toUpperCase(), document),
    createElementNS: (_namespace: string, name: string) => new HostNode(1, name.toUpperCase(), document),
    createTextNode: (value: string) => {
      const node = new HostNode(3, "#text", document);
      node.textContent = value;
      return node;
    },
    getElementById: (id: string) => rawDocument.documentElement.findAll((node) => node.getAttribute("id") === id)[0] ?? null,
    querySelectorAll: (selector: string) => rawDocument.documentElement.querySelectorAll(selector),
    querySelector: (selector: string) => rawDocument.documentElement.querySelector(selector),
    createTreeWalker(root: HostNode, _show: number, filter: { acceptNode(node: HostNode): number }) {
      const accepted = root.findAll((node) => node !== root && filter.acceptNode(node) === 1);
      let index = -1;
      return {
        currentNode: root,
        nextNode() {
          index += 1;
          if (!accepted[index]) return null;
          this.currentNode = accepted[index];
          return this.currentNode;
        },
      };
    },
  });
  document = rawDocument as unknown as Document;
  rawDocument.documentElement = new HostNode(1, "HTML", document);
  rawDocument.head = new HostNode(1, "HEAD", document);
  rawDocument.body = new HostNode(1, "BODY", document);
  rawDocument.documentElement.appendChild(rawDocument.head);
  rawDocument.documentElement.appendChild(rawDocument.body);
  const computedStyle = (node: HostNode) => ({
    paddingLeft: node.style.paddingLeft || "0",
    paddingRight: node.style.paddingRight || "0",
    animationName: "none",
    display: node.style.display || "block",
    visibility: node.style.visibility || "visible",
  });
  class HostDocumentFragment extends HostNode {
    constructor() { super(11, "#document-fragment", document); }
  }
  class HostSelectElement {
    get value(): string { return (this as unknown as { selectValue?: string }).selectValue ?? ""; }
    set value(value: string) { (this as unknown as { selectValue?: string }).selectValue = value; }
  }
  const window = Object.assign(new EventTarget(), {
    document,
    HTMLIFrameElement: class {},
    HTMLSelectElement: HostSelectElement,
    HTMLElement: HostNode,
    Node: HostNode,
    getComputedStyle: computedStyle,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number,
    cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  });
  rawDocument.defaultView = window;
  class HostResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(node: Element) { this.callback([{ target: node, contentRect: (node as unknown as HostNode).getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
    unobserve() {}
  }
  const intersectionObservers: HostIntersectionObserver[] = [];
  class HostIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: readonly number[];
    readonly targets = new Set<Element>();

    constructor(
      private readonly callback: IntersectionObserverCallback,
      options: IntersectionObserverInit = {},
    ) {
      this.root = options.root ?? null;
      this.rootMargin = options.rootMargin ?? "0px";
      this.thresholds = Array.isArray(options.threshold)
        ? options.threshold
        : [options.threshold ?? 0];
      intersectionObservers.push(this);
    }

    observe(target: Element): void { this.targets.add(target); }
    unobserve(target: Element): void { this.targets.delete(target); }
    disconnect(): void { this.targets.clear(); }
    takeRecords(): IntersectionObserverEntry[] { return []; }
    deliver(target: Element, isIntersecting: boolean): void {
      if (!this.targets.has(target)) return;
      this.callback([{
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        time: Date.now(),
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: this.root instanceof HostNode ? this.root.getBoundingClientRect() : null,
      } as IntersectionObserverEntry], this);
    }
  }
  class HostMutationObserver {
    constructor(_callback: MutationCallback) {}
    observe() {}
    disconnect() {}
    takeRecords(): MutationRecord[] { return []; }
  }
  class HostCustomEvent<T = unknown> extends Event {
    readonly detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type, init); this.detail = init?.detail as T; }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = new Map(reactHostGlobalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globals, { window, document, Node: HostNode, NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_SKIP: 3 }, Element: HostNode, HTMLElement: HostNode, HTMLInputElement: class {}, DocumentFragment: HostDocumentFragment, ResizeObserver: HostResizeObserver, IntersectionObserver: HostIntersectionObserver, MutationObserver: HostMutationObserver, CustomEvent: HostCustomEvent, getComputedStyle: computedStyle, IS_REACT_ACT_ENVIRONMENT: true });
  const container = new HostNode(1, "DIV", document);
  rawDocument.body.appendChild(container);
  return {
    container,
    intersectionObservers,
    restore: () => {
      for (const key of reactHostGlobalKeys) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globals[key];
      }
    },
  };
}
